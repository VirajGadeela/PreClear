"""Streaming reader for Transparency in Coverage in-network rate files.

These files are gzipped JSON, 5-15 GB compressed and ~40x that decompressed.
They are never written to disk and never fully parsed. Two facts about their
layout make a cheap single pass possible:

  1. `provider_references` always appears before `in_network`, so the
     group_id -> provider map can be built before any rate record is seen.
  2. Every record in both arrays begins with a fixed key, so the byte stream
     can be split on that literal at C speed. Only records whose billing code
     we care about are ever handed to the JSON parser.
"""

import json
import urllib.request
import zlib

# Each record in `provider_references` opens with this key.
PROVIDER_MARKER = b'{"provider_groups"'

# Each record in `in_network` opens with this key.
RATE_MARKER = b'{"negotiation_arrangement"'

# Marks the end of `provider_references` and the start of the rate records.
IN_NETWORK_MARKER = b'"in_network"'

_USER_AGENT = "preclear-mrf/0.1 (research; contact via repo)"

_DECODER = json.JSONDecoder()


def _inflate(read, chunk_size):
    """Yield decompressed bytes from a gzip source read `chunk_size` at a time.

    Payers publish these as *concatenated* gzip members rather than one stream.
    zlib stops at each member boundary and returns the remainder as
    unused_data, so a fresh decompressor has to pick up where it left off.
    Skipping this silently truncates the file a few hundred bytes in.

    wbits=47 lets zlib auto-detect the gzip header.
    """
    decompressor = zlib.decompressobj(47)
    while True:
        compressed = read(chunk_size)
        if not compressed:
            break
        while compressed:
            block = decompressor.decompress(compressed)
            if block:
                yield block
            leftover = decompressor.unused_data
            if not leftover:
                break
            decompressor = zlib.decompressobj(47)
            compressed = leftover
    tail = decompressor.flush()
    if tail:
        yield tail


def gzip_stream(url, chunk_size=1 << 20):
    """Stream decompressed bytes from a gzipped URL without buffering the file."""
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(request) as response:
        yield from _inflate(response.read, chunk_size)


def local_gzip_stream(path, chunk_size=1 << 20):
    """Same as gzip_stream, for a file already on disk. Used by the tests."""
    with open(path, "rb") as handle:
        yield from _inflate(handle.read, chunk_size)


def open_stream(source, chunk_size=1 << 20):
    """Stream decompressed bytes from a URL or a local path."""
    if source.startswith(("http://", "https://")):
        return gzip_stream(source, chunk_size)
    return local_gzip_stream(source, chunk_size)


def decode_record(record_bytes):
    """Parse the first JSON value in `record_bytes`, ignoring trailing bytes.

    Records are cut at the start of the *next* record, so each one carries a
    trailing comma and sometimes a closing bracket. raw_decode stops at the
    end of the first complete value, which avoids having to trim by hand.
    """
    value, _ = _DECODER.raw_decode(record_bytes.decode("utf-8"))
    return value


class RecordScanner:
    """Splits a byte stream into records, one marker at a time.

    Phases share a single pass: call records() for the provider markers, then
    call it again for the rate markers. Whatever is left over from the first
    call stays in the buffer, so the stream is only read once.
    """

    def __init__(self, stream):
        self._stream = stream
        self._buffer = b""
        self.bytes_read = 0
        # Optional callback, invoked per block so a long scan can report
        # progress even when it goes many minutes without a match.
        self.on_block = None

    def _fill(self):
        """Pull one more block into the buffer. False when the stream ends."""
        block = next(self._stream, None)
        if block is None:
            return False
        self._buffer += block
        self.bytes_read += len(block)
        if self.on_block is not None:
            self.on_block()
        return True

    def records(self, marker, stop_marker):
        """Yield every record in an array, stopping at `stop_marker`.

        The buffer is split in bulk rather than sliced once per record: slicing
        a megabyte-sized buffer per record makes the whole pass quadratic.
        `stop_marker` is left at the head of the buffer for the next caller.
        """
        # Enough trailing bytes to catch either marker straddling a block
        # boundary. Too small a carryover silently loses the array's end.
        carryover = max(len(marker), len(stop_marker)) - 1
        while True:
            stop = self._buffer.find(stop_marker)
            region = self._buffer if stop == -1 else self._buffer[:stop]
            pieces = region.split(marker)

            if stop != -1:
                # The array ended inside the buffer, so every piece is whole.
                for piece in pieces[1:]:
                    yield marker + piece
                self._buffer = self._buffer[stop:]
                return

            # The last piece may be cut off mid-record, so hold it back.
            for piece in pieces[1:-1]:
                yield marker + piece
            if len(pieces) > 1:
                self._buffer = marker + pieces[-1]
            else:
                self._buffer = self._buffer[-carryover:]

            if not self._fill():
                if len(pieces) > 1 and len(self._buffer) > len(marker):
                    yield self._buffer
                self._buffer = b""
                return

    def matching_records(self, marker, patterns):
        """Yield only the records that contain one of `patterns`.

        An in-network array holds tens of millions of records and we want a
        handful, so records are located by searching for the pattern itself and
        expanding to the surrounding record boundaries. Everything else is
        skipped at the speed of bytes.find, never parsed and never copied.
        """
        longest = max(len(pattern) for pattern in patterns)
        searched = 0
        while True:
            hit = -1
            for pattern in patterns:
                found = self._buffer.find(pattern, searched)
                if found != -1 and (hit == -1 or found < hit):
                    hit = found

            if hit == -1:
                # Nothing here. Remember how far we got so a large unwanted
                # record is not rescanned on every block, then drop everything
                # before the record currently being accumulated.
                searched = max(0, len(self._buffer) - (longest - 1))
                cut = self._buffer.rfind(marker, 0, searched)
                if cut > 0:
                    self._buffer = self._buffer[cut:]
                    searched -= cut
                if not self._fill():
                    return
                continue

            start = self._buffer.rfind(marker, 0, hit)
            if start == -1:
                start = 0

            # Read on until the next record begins, which is where this one ends.
            end = self._buffer.find(marker, hit)
            while end == -1:
                if not self._fill():
                    yield self._buffer[start:]
                    self._buffer = b""
                    return
                end = self._buffer.find(marker, hit)

            yield self._buffer[start:end]
            self._buffer = self._buffer[end:]
            searched = 0
