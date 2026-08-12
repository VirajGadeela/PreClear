"""Indianapolis-metro hospital price transparency files.

Every URL here came from the hospital's own `cms-hpt.txt`, which CMS requires at
the web root. That file is the discovery mechanism: it gives location name,
source page, and a direct MRF URL, so no scraping is needed.

Some systems publish one price list covering several hospitals. Where that
happens, `covers` records the locations sharing the file, because a single file
means a single set of prices — those locations cannot be compared against each
other on price.
"""

FACILITIES = [
    {
        "key": "franciscan-indianapolis",
        "name": "Franciscan Health Indianapolis",
        "url": "https://images.franciscanhealth.org/pdfs/enterprise/price_transparency/350913537_franciscan-health-indianapolis_standardcharges.zip",
    },
    {
        "key": "franciscan-carmel",
        "name": "Franciscan Health Carmel",
        "url": "https://images.franciscanhealth.org/pdfs/enterprise/price_transparency/350913537_franciscan-health-carmel_standardcharges.zip",
    },
    {
        "key": "franciscan-mooresville",
        "name": "Franciscan Health Mooresville",
        "url": "https://images.franciscanhealth.org/pdfs/enterprise/price_transparency/350913537_franciscan-health-mooresville_standardcharges.zip",
    },
    {
        "key": "franciscan-ortho-carmel",
        "name": "Franciscan Health Orthopedic Hospital Carmel",
        "url": "https://images.franciscanhealth.org/pdfs/enterprise/price_transparency/350913537_franciscan-health-orthopedic-carmel_standardcharges.zip",
    },
    {
        "key": "eskenazi",
        "name": "Eskenazi Health",
        "url": "https://www.eskenazihealth.edu/356005697_eskenazihealth_standardcharges.csv",
    },
    {
        "key": "hendricks-regional",
        "name": "Hendricks Regional Health",
        "url": "https://www.hendricks.org/upload/docs/Billing/351361243_hendricks-regional-health_standardcharges.csv",
    },
    {
        "key": "ascension-st-vincent",
        "name": "Ascension St. Vincent Hospital Indianapolis",
        "url": "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/in-csv/350869066_st-vincent-hospital-and-health-care-center-inc_standardcharges.csv",
        "covers": [
            "Indianapolis",
            "Avon",
            "Castleton",
            "Indianapolis South",
            "Plainfield",
            "Women's Hospital",
            "Peyton Manning Children's",
        ],
    },
    {
        "key": "ascension-st-vincent-carmel",
        "name": "Ascension St. Vincent Carmel",
        "url": "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/in-csv/743107055_st-vincent-carmel-hospital-inc_standardcharges.csv",
    },
    {
        "key": "riverview",
        "name": "Riverview Health Noblesville",
        "url": "https://riverview.org/sites/default/files/pdf/25-005054-1_riverview-health_standardcharges.csv",
        "covers": ["Noblesville", "Westfield"],
    },
    # IU Health publishes one file per EIN, and EIN 351955872 covers five
    # hospitals at once — Methodist, University, Riley, Morgan and Saxony share
    # a single price list, so they cannot be compared against each other.
    # The system's other hospitals (Arnett, Ball Memorial, Bedford, Bloomington,
    # Jay, Paoli, White Memorial) are outside the metro and excluded.
    #
    # Verified 2026-08-11: the Indianapolis, North and West files are three
    # separate EINs at three real addresses, but their imaging prices are
    # identical row for row. IU Health prices system-wide, so a cheaper
    # site-of-service comparison can only run *between* systems, never within
    # this one. Do not read three files as three independent price observations.
    {
        "key": "iu-health-indianapolis",
        "name": "IU Health Methodist",
        "url": "https://cdn.iuhealth.org/resources/351955872_indiana-university-health-inc._standardcharges.zip",
        "covers": ["Methodist", "University", "Riley", "Morgan", "Saxony"],
    },
    {
        "key": "iu-health-north",
        "name": "IU Health North Hospital",
        "url": "https://cdn.iuhealth.org/resources/351932442_indiana-university-health-north-hospital-inc._standardcharges.zip",
    },
    {
        "key": "iu-health-west",
        "name": "IU Health West Hospital",
        "url": "https://cdn.iuhealth.org/resources/351814660_indiana-university-health-west-hospital-inc._standardcharges.zip",
    },
]

# Both IU Health and Community Health Network refuse plain HTTP clients on their
# cms-hpt.txt (connection reset and Akamai 403 respectively), so their URLs were
# read from a browser. Re-check by hand when refreshing this registry.
MISSING = []

# Facilities deliberately not attempted, with the reason. Keeping these here
# rather than deleting them stops the next person rediscovering the same dead
# ends, and stops a run spending 16.6 GB of bandwidth to learn nothing.
#
# A metro's coverage is only as good as the files in it. Two large Indianapolis
# systems publish no usable CPT-level imaging prices, so a patient whose nearest
# option is an Ascension St Vincent Indianapolis or Community hospital gets no
# comparison for that facility. That is a real hole in the product, not a
# tidy-up detail — see the coverage warning in CLAUDE.md.
EXCLUDED = [
    {
        "name": "Community Hospital East / North / South, Stones Crossing Imaging",
        "url_pattern": "https://media.ecommunity.com/PricingTransparency/*.csv",
        "reason": (
            "No CPT codes found. These files carry a single code slot with types "
            "CDM, LOCAL and MS-DRG only; a 150,000-row sample of Community "
            "Hospital North contained zero CPT codes and no imaging-range codes. "
            "Not conclusively proven across the whole file, because the host is "
            "too slow to scan it: a full byte scan of the 2.8 GB North file did "
            "not finish in 10 minutes, and the 7.8 GB East file and Stones "
            "Crossing both hit read timeouts during extraction. Re-test if their "
            "publishing format changes."
        ),
    },
    {
        "name": "Ascension St. Vincent Hospital Indianapolis",
        "url_pattern": (
            "https://healthcare.ascension.org/-/media/project/ascension/healthcare/"
            "price-transparency-files/in-csv/350869066_*.csv"
        ),
        "reason": (
            "Parses cleanly but publishes CDM and revenue codes almost "
            "exclusively, so it yields no CPT imaging prices. Its 1,165 lines "
            "matching '70450' are all substrings of CDM 702570450, a catheter. "
            "Left in FACILITIES because it parses and returning zero rows is the "
            "correct, informative result."
        ),
    },
]
