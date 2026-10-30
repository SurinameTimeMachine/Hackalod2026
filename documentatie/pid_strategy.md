# PID-strategie

## Introductie
Per bron, formulie voor het genereren van PIDs op basis van informatie uit de csv.

| Niveau | Wat is het | Patroon | Voorbeeld |
| --- | --- | --- | --- |
| Bronrecord | Eén akte, kaart, registerregel of contract | `/record/{dataset}/{bron-id}` | `/record/census1921/3f2a9c1e-…` |
| Persoonsobservatie | Eén persoon zoals die in één bronrecord staat, in één rol | `/observation/{dataset}/{bron-id}/{rol}` | `/observation/civil-birth/12345/mother` |
| Gereconstrueerde persoon | Onze conclusie dat meerdere observaties dezelfde mens zijn | `/person/{stm-nummer}` | `/person/p-7k3m9q` |

## Formule per dataset

Voor de meeste datasets ligt het bron-id al vast in de CSV. Bij de slavenregisters en de ruwe burgerlijke stand moeten we nog een keuze maken.

| Dataset | Code | Bron-id (uit de CSV) | Voorbeeld observatie | Opmerking |
| --- | --- | --- | --- | --- |
| Geboorteakten 1828–1921 | `civil-birth` | kolom `id` | `/observation/civil-birth/12345/child` | Rollen: child, mother, father, informant, witness1, witness2. Wordt al zo gedaan op main. |
| Overlijdensakten 1845–1915 | `civil-death` | kolom `id` | `/observation/civil-death/67890/deceased` | Rollen: deceased, parent1, parent2, spouse1–4, informant, witness1, witness2. |
| Burgerlijke stand ruw (embargo) | `civil-raw` | scan-id plus aktenummer op de scan | `/observation/civil-raw/{scan}-{akte}/groom` | Eerst nagaan of elke akte een eigen nummer heeft. Wel PIDs maken, niet publiceren tot het embargo eraf is. |
| Wijkregisters 1828–1847 | `wardregister` | kolom `Id` | `/observation/wardregister/4512/head` | Kaart-id bewaren als vindplaats. |
| Slaven- en emancipatieregisters | `slaveregister` | `Id_source` waar gevuld, anders `Id_person` + inventarisnummer + folio | `/observation/slaveregister/010801a1797/enslaved` | 192.335 regels, 95.538 personen. `Id_person` is al een reconstructie door de makers: die wordt `/person/slaveregister-1109`. 30.133 regels hebben geen `Id_source`; vraag de makers om een regel-id in versie 1.2. |
| Volkstelling 1921 | `census1921` | UUID (12e kolom) | `/observation/census1921/{uuid}/person` | Sluit aan op `stm-census1921/<uuid>` uit de README. |
| Volkstelling 1950 | `census1950` | toegang + inventarisnummer + volgnummer | `/observation/census1950/2.10.19.02-123-45/person` | Voor- en achterkant van een kaart vormen samen één record. |
| Migratieregisters (Hindostaans, Chinees, Javaans) | `migration-hindostani`, `migration-chinese`, `migration-javanese` | UUID | `/observation/migration-javanese/{uuid}/migrant` | Dezelfde UUID als in de index van het Nationaal Archief, dus we linken met `sameAs` naar hun pagina. |
| Madeisu-contracten | `madeisu` | kolom `ID` | `/observation/madeisu/{ID}/worker` | Bronvermelding Madeisu verplicht. |
| Almanakken (eigenaren, administrateurs) | `almanak` | kolom `recordid` | `/observation/almanak/{recordid}/owner` | Een record is één plantage in één jaargang. |



### Burgerlijke Stand - Geboortes
#### Source:
- `https://example.org/surinametimemachine/source` + `[row-id]`


