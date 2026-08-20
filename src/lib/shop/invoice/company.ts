import { SHOP_BRAND } from '../brand'

/** Afzender-/bedrijfsgegevens voor de factuur (overgenomen van de bestaande
 *  MBT-factuur). De naam komt uit `SHOP_BRAND`, zodat factuur, mail en header
 *  niet uit elkaar kunnen lopen. */
export const INVOICE_COMPANY = {
  name: SHOP_BRAND.name,
  street: 'Jacob Bontiusplaats 40',
  zipCity: '1018 LL  Amsterdam',
  country: 'Nederland',
  email: SHOP_BRAND.email,
  website: '',
  iban: 'NL65ABNA0150701306',
  kvk: '99220334',
  vatNumber: 'NL868875533B01',
  defaultVatRate: 21,
} as const
