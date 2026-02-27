import type {
  OrderParserFieldAliases,
  OrderParserProfile,
  OrderParserProfileOverrides,
} from '@/types';

export const DEFAULT_ORDER_PARSER_PROFILE_ID = 'sage-openwe-v1';

export const ORDER_PARSER_ALIAS_FIELDS: Array<keyof OrderParserFieldAliases> = [
  'orderNumberCandidates',
  'orderYear',
  'openQuantity',
  'artNoDE',
  'artNoIT',
  'ean',
  'supplierId',
  'belegnummer',
];

const DEFAULT_PROFILE: OrderParserProfile = {
  id: DEFAULT_ORDER_PARSER_PROFILE_ID,
  label: 'Sage OpenWE v1',
  description: 'Default profile for offene Bestellungen / offene Wareneingaenge exports',
  aliases: {
    orderNumberCandidates: ['BELEGNUMMER', 'BELEG-NR', 'BESTELLNUMMER', 'ORDER-NO', 'BESTELLUNG'],
    orderYear: ['BESTELLJAHR', 'ORDER-YEAR', 'JAHR'],
    openQuantity: ['OFFENE MENGE', 'OPEN QTY', 'RESTMENGE', 'OFFEN', '<OFFENE MENGE (VORGANGSBEZOGEN)', 'OFFENE MENGE (VORGANGSBEZOGEN)'],
    artNoDE: ['ART-# (DE)', 'ART-DE', 'FALMEC-ART', 'ARTIKELNR', 'ARTIKEL-NR', 'ARTIKELNUMMER'],
    artNoIT: ['ART-# (IT)', 'ART-IT', 'CODICE', 'HERSTELLERARTIKELNR', 'BESTELLNUMMER'],
    ean: ['EAN', 'BARCODE', 'EAN-CODE', 'GTIN', 'EAN13', 'EAN-NUMMER'],
    supplierId: ['LIEFERANT', 'SUPPLIER', 'KREDITORNR', 'KREDITOR'],
    belegnummer: ['BELEGNUMMER', 'BELEG-NR', 'BESTELLNUMMER', 'ORDER-NO', 'BESTELLUNG'],
  },
  orderNumberRegex: '^1\\d{4}$',
  orderYearRegex: '^\\d{4}$',
  orderNumberTieBreakPriority: ['BELEGNUMMER'],
};

export const ORDER_PARSER_PROFILES: OrderParserProfile[] = [DEFAULT_PROFILE];

function cloneAliases(aliases: OrderParserFieldAliases): OrderParserFieldAliases {
  return {
    orderNumberCandidates: [...aliases.orderNumberCandidates],
    orderYear: [...aliases.orderYear],
    openQuantity: [...aliases.openQuantity],
    artNoDE: [...aliases.artNoDE],
    artNoIT: [...aliases.artNoIT],
    ean: [...aliases.ean],
    supplierId: [...aliases.supplierId],
    belegnummer: [...aliases.belegnummer],
  };
}

function normalizeAliasList(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
}

export function getOrderParserProfileById(profileId: string): OrderParserProfile | undefined {
  const found = ORDER_PARSER_PROFILES.find((profile) => profile.id === profileId);
  if (!found) return undefined;
  return {
    ...found,
    aliases: cloneAliases(found.aliases),
    orderNumberTieBreakPriority: [...(found.orderNumberTieBreakPriority ?? [])],
  };
}

export function mergeOrderParserProfile(
  base: OrderParserProfile,
  overrides?: OrderParserProfileOverrides,
): OrderParserProfile {
  if (!overrides) {
    return {
      ...base,
      aliases: cloneAliases(base.aliases),
      orderNumberTieBreakPriority: [...(base.orderNumberTieBreakPriority ?? [])],
    };
  }

  const mergedAliases = cloneAliases(base.aliases);
  const overrideAliases = overrides.aliases;
  if (overrideAliases) {
    for (const field of ORDER_PARSER_ALIAS_FIELDS) {
      const list = overrideAliases[field];
      if (Array.isArray(list)) {
        mergedAliases[field] = normalizeAliasList(list);
      }
    }
  }

  return {
    ...base,
    ...overrides,
    aliases: mergedAliases,
    orderNumberTieBreakPriority: Array.isArray(overrides.orderNumberTieBreakPriority)
      ? normalizeAliasList(overrides.orderNumberTieBreakPriority)
      : [...(base.orderNumberTieBreakPriority ?? [])],
  };
}

export function resolveOrderParserProfile(
  profileId?: string,
  overrides?: OrderParserProfileOverrides,
  explicitProfile?: OrderParserProfile,
): OrderParserProfile {
  const baseProfile = explicitProfile
    ? {
        ...explicitProfile,
        aliases: cloneAliases(explicitProfile.aliases),
        orderNumberTieBreakPriority: [...(explicitProfile.orderNumberTieBreakPriority ?? [])],
      }
    : getOrderParserProfileById(profileId || DEFAULT_ORDER_PARSER_PROFILE_ID)
      || getOrderParserProfileById(DEFAULT_ORDER_PARSER_PROFILE_ID)
      || { ...DEFAULT_PROFILE, aliases: cloneAliases(DEFAULT_PROFILE.aliases) };

  return mergeOrderParserProfile(baseProfile, overrides);
}
