import type { Pack } from './index';

export const lease: Pack = {
  facts: [
    'how many months of the lease have passed when the event happens',
    'whether the tenant leaves before the term ends, and with how many days of notice',
    'the deposit held, and what the landlord deducts from it',
    'whether damage is ordinary wear or caused by the tenant',
    'what needs repair, who must fix it, and how many days the landlord took',
    'whether the landlord raised the rent during the term, and with how much notice',
    'how many days the rent was paid late, and the fee for it',
    'whether the tenant sublet the place or let someone else live there',
    'whether the landlord entered the place, and with how much notice',
    'whether the lease renews on its own, and the notice needed to stop it',
    'whether the place could not be lived in for a time (flood, fire, no water)',
    'whether the landlord sold the property during the lease',
  ],
  seeds: {
    baseline: [
      'the tenant pays on time and leaves at the end of the term with the notice the lease asks for',
      'the tenant reports a broken water heater, and the landlord fixes it within a week',
      'the deposit comes back at the end, minus a cleaning fee the lease names',
    ],
    overlap: [
      'the tenant leaves early, and the landlord finds a new tenant within two weeks',
      'the tenant fixes an urgent leak themselves after the landlord does not answer, and deducts the cost',
      'a family member stays for two months, and the lease forbids other occupants',
    ],
    definition: [
      'worn carpet and faded paint after three years, which the landlord calls damage',
      'a guest who stays most weekends',
      'a repair the lease calls minor, which costs more than a month’s rent',
    ],
    procedure: [
      'the tenant gives notice by message instead of a letter',
      'the rent is paid five days late once, in a month the landlord was told about in advance',
      'the landlord keeps the deposit and gives no list of deductions',
    ],
    combination: [
      'the tenant leaves early after a rent increase, losing the deposit and owing the rest of the term',
      'the place floods, the tenant moves out, and the lease still charges rent',
      'the property is sold, and the new owner ends the lease before its term',
    ],
  },
  hints: [
    'the deposit comes back at the end, less only real damage beyond ordinary wear, with a list',
    'the landlord makes repairs that keep the place livable, within a reasonable time',
    'the rent does not go up during a fixed term unless the lease says how and when',
    'a tenant who leaves early owes rent until a new tenant is found, not always until the end of the term',
    'the landlord gives notice before entering, except in an emergency',
    'no rent is due for a time the place cannot be lived in through no fault of the tenant',
    'as a landlord: the tenant pays on time, keeps the place in order and asks before subletting',
    'people accept a late fee stated in the lease and paying for damage they caused',
  ],
};
