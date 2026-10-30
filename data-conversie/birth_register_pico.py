# doel: converteer een CSV met overlijdensaktes naar PiCo (Persons in Context)
# modelreferentie: https://personsincontext.org/model/  (picom = https://personsincontext.org/model#)
# modelreferentie: Mourits e.a., enslaved-PiCo, to be published

import math
import re
import sys
from datetime import datetime

import pandas as pd
from pyshacl import validate
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, XSD

#settings
INPUT_CSV = "../data/03-birth-certificates/Paramaribo_birth_certificates_V1.0.csv"
OUTPUT_FILE = "birth_certificates.json"
OUTPUT_FORMAT = "json-ld"
SHACL_FILE = "pico_shacl.ttl"
USE_PNV = True
BASE_URI = "https://surinametijdmachine.org/"
DATASET_ID = "civil-birth"

#source description
SOURCE_TYPE_ID = 551
SOURCE_LABEL = "burgerlijke stand geboorte"
HOLDING_ARCHIVE = "https://nationaalarchief.sr/"

#PiCo Role Vocabulary
ROLE_CHILD = 575
ROLE_INFORMANT = 489
ROLE_WITNESS = 573

#Kolombeschrijving
COL_ID = "id"
COL_CERT_DATE = "cert_date"
COL_CERT_PLACE = "cert_place"
COL_INVENTORY = "inventory_number"
COL_FOLIO = "folio"

# Cell values that mean "no data".
MISSING_VALUES = {"", "na", "n/a", "nan", "none", "null", "unknown"}

#NameSpaces
PICOM = Namespace("https://personsincontext.org/model#")
SDO = Namespace("https://schema.org/")
PROV = Namespace("http://www.w3.org/ns/prov#")
PNV = Namespace("https://w3id.org/pnv#")
PICOT_ROLES = Namespace("https://terms.personsincontext.org/roles/")
PICOT_SOURCETYPES = Namespace("https://terms.personsincontext.org/sourcetypes/")

#Beschrijving personen in de CSV
PEOPLE = [
    {
        "suffix": "child", "role": ROLE_CHILD, "relation": "child",
        "columns": {
            "given": "child_fname", "prefix": "child_prefix", "family": "child_sname",
            "sex": "child_sex", "birth_date": "birth_date", "birth_place": "birth_place",
        },
    },
    {
        "suffix": "mother", "role": None, "relation": "parent",
        "columns": {
            "given": "moth_fname", "prefix": "moth_prefix", "family": "moth_sname",
            "age": "mother_age", "occupation": "moth_occ", "address": "moth_place",
            "alive": "mother_alive",
        },
    },
    {
        "suffix": "father", "role": None, "relation": "parent",
        "columns": {
            "given": "fath_fname", "prefix": "fath_prefix", "family": "fath_sname",
        },
    },
    {
        "suffix": "inf", "role": ROLE_INFORMANT, "relation": None,
        "columns": {
            "given": "inf_fname", "prefix": "inf_prefix", "family": "inf_sname",
            "age": "inf_age", "occupation": "inf_occ", "address": "inf_place",
        },
    },
    {
        "suffix": "wit1", "role": ROLE_WITNESS, "relation": None,
        "columns": {
            "given": "witn_fname_1", "prefix": "witn_prefix_1", "family": "witn_sname_1",
            "age": "witn_age_1", "occupation": "witn_occ_1", "address": "witn_place_1",
        },
    },
    {
        "suffix": "wit2", "role": ROLE_WITNESS, "relation": None,
        "columns": {
            "given": "witn_fname_2", "prefix": "witn_prefix_2", "family": "witn_sname_2",
            "age": "witn_age_2", "occupation": "witn_occ_2", "address": "witn_place_2",
        },
    },
]

def main():
    df = pd.read_csv(INPUT_CSV, dtype=str, keep_default_na=False, encoding="utf-8-sig")

    g = build_graph(df)

    g.serialize(destination=OUTPUT_FILE, format=OUTPUT_FORMAT)
    print(f"Output written to: {OUTPUT_FILE}")

    if SHACL_FILE:
        validate_graph(g, SHACL_FILE)


def clean(value):
    if value is None:
        return None

    if isinstance(value, float):
        if math.isnan(value):
            return None
        value = str(int(value)) if value.is_integer() else str(value)
    elif not isinstance(value, str):
        value = str(value)

    value = value.strip()
    if value.lower() in MISSING_VALUES or "@" in value:
        return None
    return value


def clean_name_part(value):
    value = clean(value)
    if value is None:
        return None
    value = re.sub(r"\s*\$\s*", " ", value).strip()
    return value or None

def parse_date(value):
    value = clean(value)
    if value is None:
        return None
    for date_format in ("%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, date_format).date().isoformat()
        except ValueError:
            pass
    return None

def observation_uri(row_id, suffix):
    return URIRef(f"{BASE_URI}/record/{DATASET_ID}/{row_id}/{suffix}")

def source_uri(row_id):
    return URIRef(f"{BASE_URI}/record/{DATASET_ID}/{row_id}")

def make_source_name(row, row_id, date, place):
    parts = [SOURCE_LABEL]

    if place:
        parts.append(place)

    parts.append(date or clean(row.get(COL_CERT_DATE)) or "datum onbekend")

    inventory = clean(row.get(COL_INVENTORY))
    if inventory:
        parts.append(f"inventarisnummer {inventory}")

    folio = clean(row.get(COL_FOLIO))
    if folio:
        parts.append(f"folio {folio}")

    return f"{', '.join(parts)} ({row_id})"

def add_source(g, row, row_id):
    source = source_uri(row_id)
    date = parse_date(row.get(COL_CERT_DATE))
    place = (clean(row.get(COL_CERT_PLACE)) or "").title()

    g.add((source, RDF.type, SDO.ArchiveComponent))
    g.add((source, SDO.additionalType, PICOT_SOURCETYPES[str(SOURCE_TYPE_ID)]))
    g.add((source, SDO.name, Literal(make_source_name(row, row_id, date, place), lang="nl")))
    g.add((source, SDO.holdingArchive, URIRef(HOLDING_ARCHIVE)))

    if date:
        g.add((source, SDO.dateCreated, Literal(date, datatype=XSD.date)))
    if place:
        # SHACL requires a language-tagged literal here
        g.add((source, SDO.contentLocation, Literal(place, lang="nl")))

    return source

def add_name(g, person, given, prefix, family):
    #merge names if necessary
    full_family = " ".join(part for part in (prefix, family) if part)
    full_name = " ".join(part for part in (given, full_family) if part)

    g.add((person, SDO.name, Literal(full_name, lang="nl")))
    if given:
        g.add((person, SDO.givenName, Literal(given)))
    if full_family:
        g.add((person, SDO.familyName, Literal(full_family)))

    if USE_PNV:
        name_node = BNode()
        g.add((person, SDO.additionalName, name_node))
        g.add((name_node, RDF.type, PNV.PersonName))
        g.add((name_node, PNV.literalName, Literal(full_name)))
        if given:
            g.add((name_node, PNV.givenName, Literal(given)))
        if prefix:
            g.add((name_node, PNV.surnamePrefix, Literal(prefix)))
        if family:
            g.add((name_node, PNV.baseSurname, Literal(family)))

def add_date(g, subject, predicate, raw_value):
    raw_value = clean(raw_value)
    if raw_value is None:
        return
    g.add((subject, predicate, Literal(raw_value, datatype=XSD.string)))

    iso_date = parse_date(raw_value)
    if iso_date:
        g.add((subject, predicate, Literal(iso_date, datatype=XSD.date)))

def add_person(g, person, source, role, fields):
    given = clean_name_part(fields.get("given"))
    prefix = clean_name_part(fields.get("prefix"))
    family = clean_name_part(fields.get("family"))

    if not given and not family:
        return False

    g.add((person, RDF.type, PICOM.PersonObservation))
    g.add((person, RDF.type, SDO.Person))
    g.add((person, PROV.hadPrimarySource, source))

    add_name(g, person, given, prefix, family)

    sex = (clean(fields.get("sex")) or "").lower()
    if sex == "male":
        g.add((person, SDO.gender, SDO.Male))
    elif sex == "female":
        g.add((person, SDO.gender, SDO.Female))

    text_fields = [
        ("age", PICOM.hasAge),            
        ("occupation", SDO.hasOccupation),
        ("birth_place", SDO.birthPlace),
        ("address", SDO.address),
    ]
    for field, predicate in text_fields:
        value = clean(fields.get(field))
        if value:
            g.add((person, predicate, Literal(value)))

    add_date(g, person, SDO.birthDate, fields.get("birth_date"))

    if (clean(fields.get("alive")) or "").lower() == "deceased":
        g.add((person, PICOM.deceased, Literal(True)))

    if role is not None:
        g.add((person, PICOM.hasRole, PICOT_ROLES[str(role)]))

    return True

def find_available_people(csv_columns):

    available_people = []
    missing_columns = []

    for person in PEOPLE:
        existing = {}
        for field, column in person["columns"].items():
            if column in csv_columns:
                existing[field] = column
            else:
                missing_columns.append(column)
        available_people.append({**person, "columns": existing})

    if missing_columns:
        print(
            f"Warning: {len(missing_columns)} configured column(s) not in the CSV, "
            f"skipped: {', '.join(sorted(missing_columns))}",
            file=sys.stderr,
        )
    return available_people

def convert_row(g, row, people):
    """Convert one CSV row (one certificate) into triples."""
    row_id = str(row[COL_ID]).strip()
    source = add_source(g, row, row_id)

    children = []
    parents = []

    for person_spec in people:
        fields = {field: row.get(column) for field, column in person_spec["columns"].items()}

        person = observation_uri(row_id, person_spec["suffix"])
        was_added = add_person(g, person, source, person_spec["role"], fields)
        if not was_added:
            continue

        if person_spec["relation"] == "child":
            children.append(person)
        elif person_spec["relation"] == "parent":
            parents.append(person)

    for child in children:
        for parent in parents:
            g.add((child, SDO.parent, parent))
            g.add((parent, SDO.children, child))

def build_graph(df):
    """Convert the whole table into one RDF graph."""
    if COL_ID not in df.columns:
        sys.exit(f"Column '{COL_ID}' is missing in the CSV; adjust COL_ID.")

    g = Graph()
    g.bind("picom", PICOM)
    g.bind("sdo", SDO)
    g.bind("prov", PROV)
    g.bind("pnv", PNV)
    g.bind("picot_roles", PICOT_ROLES)
    g.bind("picot_sourcetypes", PICOT_SOURCETYPES)

    people = find_available_people(set(df.columns))

    rows_done = 0
    for _, row in df.iterrows():
        if clean(row[COL_ID]) is None:  # skip rows without an id
            continue
        convert_row(g, row, people)
        rows_done += 1

    print(f"{rows_done} certificates processed, {len(g)} triples.")
    return g

def validate_graph(g, shacl_file):
    conforms, _, report_text = validate(
        g,
        shacl_graph=shacl_file,
        inference="none",
        advanced=True,
        meta_shacl=False,
        js=False,
        debug=False,
    )
    print("SHACL: conforms" if conforms else "SHACL: DOES NOT conform")
    if not conforms:
        print(report_text)

if __name__ == "__main__":
    main()