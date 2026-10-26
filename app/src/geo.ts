/**
 * Where the member is, and how far each hospital is from them.
 *
 * The walkthrough's location screen takes a ZIP code and a radius. Both are
 * real here: hospital coordinates and ZIP centres come from US Census sources
 * (`pipeline/export_geo.py`, bundled as `preclear-geo.json`), and the radius
 * decides which hospitals are compared. Distances are straight-line miles from
 * the ZIP's centre, not driving distances.
 *
 * Prices only cover the Indianapolis area, so a ZIP is accepted only when its
 * centre is within reach of the hospitals Preclear reads. The city and state
 * names below are the walkthrough's own tables.
 */

import raw from '../assets/preclear-geo.json';

type Geo = {
  facilities: Record<string, { lat: number; lon: number; matched: string }>;
  zips: Record<string, [number, number]>;
};

const geo = raw as unknown as Geo;

/** Downtown Indianapolis. A ZIP further than this from it is outside the area the prices cover. */
const CENTRE: [number, number] = [39.7684, -86.1581];
const AREA_MILES = 35;

const STATES: [number, number, string][] = [
  [5, 9, 'Puerto Rico'], [10, 27, 'Massachusetts'], [28, 29, 'Rhode Island'], [30, 38, 'New Hampshire'],
  [39, 49, 'Maine'], [50, 59, 'Vermont'], [60, 69, 'Connecticut'], [70, 89, 'New Jersey'],
  [100, 149, 'New York'], [150, 196, 'Pennsylvania'], [197, 199, 'Delaware'], [200, 205, 'Washington, DC'],
  [206, 219, 'Maryland'], [220, 246, 'Virginia'], [247, 268, 'West Virginia'], [270, 289, 'North Carolina'],
  [290, 299, 'South Carolina'], [300, 319, 'Georgia'], [320, 349, 'Florida'], [350, 369, 'Alabama'],
  [370, 385, 'Tennessee'], [386, 397, 'Mississippi'], [398, 399, 'Georgia'], [400, 427, 'Kentucky'],
  [430, 459, 'Ohio'], [460, 479, 'Indiana'], [480, 499, 'Michigan'], [500, 528, 'Iowa'],
  [530, 549, 'Wisconsin'], [550, 567, 'Minnesota'], [570, 577, 'South Dakota'], [580, 588, 'North Dakota'],
  [590, 599, 'Montana'], [600, 629, 'Illinois'], [630, 658, 'Missouri'], [660, 679, 'Kansas'],
  [680, 693, 'Nebraska'], [700, 714, 'Louisiana'], [716, 729, 'Arkansas'], [730, 749, 'Oklahoma'],
  [750, 799, 'Texas'], [800, 816, 'Colorado'], [820, 831, 'Wyoming'], [832, 838, 'Idaho'],
  [840, 847, 'Utah'], [850, 865, 'Arizona'], [870, 884, 'New Mexico'], [889, 898, 'Nevada'],
  [900, 961, 'California'], [967, 968, 'Hawaii'], [970, 979, 'Oregon'], [980, 994, 'Washington'],
  [995, 999, 'Alaska'],
];

const CITIES: [number, number, string][] = [
  [460, 462, 'Indianapolis'], [463, 464, 'Gary'], [465, 466, 'South Bend'], [467, 468, 'Fort Wayne'],
  [469, 469, 'Kokomo'], [470, 470, 'Lawrenceburg'], [471, 471, 'New Albany'], [472, 472, 'Columbus'],
  [473, 473, 'Muncie'], [474, 474, 'Bloomington'], [475, 475, 'Washington'], [476, 477, 'Evansville'],
  [478, 478, 'Terre Haute'], [479, 479, 'Lafayette'],
];

export function miles(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

export type ZipCheck =
  | { status: 'typing' }
  | { status: 'in'; city: string; centre: [number, number] }
  | { status: 'out'; place: string; inIndiana: boolean };

export function checkZip(zip: string): ZipCheck {
  if (zip.length < 5) return { status: 'typing' };
  const prefix = parseInt(zip.slice(0, 3), 10);
  const state = STATES.find(([a, b]) => prefix >= a && prefix <= b)?.[2] ?? null;
  const city = CITIES.find(([a, b]) => prefix >= a && prefix <= b)?.[2] ?? 'Indiana';
  const centre = geo.zips[zip];
  if (state === 'Indiana' && centre && miles(centre, CENTRE) <= AREA_MILES) {
    return { status: 'in', city, centre };
  }
  if (state === 'Indiana') return { status: 'out', place: city, inIndiana: true };
  return { status: 'out', place: state ?? 'that area', inIndiana: false };
}

/** Straight-line miles from a ZIP centre to a hospital, or null when either is unknown. */
export function distanceTo(centre: [number, number], facilityKey: string): number | null {
  const facility = geo.facilities[facilityKey];
  if (!facility) return null;
  return miles(centre, [facility.lat, facility.lon]);
}

/** The street address a hospital's coordinates were geocoded from, or '' when it has none. */
export function geocodedAddress(facilityKey: string): string {
  // The Census geocoder writes "IN, 46202"; the hospital files write "IN 46202".
  return (geo.facilities[facilityKey]?.matched ?? '').replace(/, (\d{5})$/, ' $1');
}

export const formatMiles = (value: number) => `${value.toFixed(1)} mi`;
