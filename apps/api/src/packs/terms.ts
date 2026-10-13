import type { Pack } from './index';

export const terms: Pack = {
  facts: [
    'whether the term renews on its own, and how many days of notice stop the renewal',
    'how many days after purchase or renewal the customer cancels',
    'how much of what was paid is refunded on cancellation',
    'whether the provider changed the price or the terms, and with how many days of notice',
    'whether the customer keeps using the service after a change (taken as acceptance)',
    'whether the provider suspended or closed the account, and for what stated reason',
    'whether a payment failed or was late, and the fee for it',
    'the fee for leaving before a minimum term ends',
    'the amount the customer lost, against the cap on what the provider owes',
    'what kind of loss it was (the service itself, lost data, lost income)',
    'whether the dispute must go to arbitration or to a named court, and where',
    'how many days after the problem the customer complained',
    'whether the customer broke a rule of use',
  ],
  seeds: {
    baseline: [
      'the customer uses the service as intended and pays on time for the whole term',
      'the customer cancels well before the renewal date, in the way the terms ask',
    ],
    overlap: [
      'the customer cancels in time, but through a channel the terms do not accept',
      'the service fails for days and the customer stops paying for that period',
    ],
    definition: [
      'a use of the service the customer thinks is personal and the provider may call commercial',
      'a loss the customer sees as the service failing and the terms may call indirect',
    ],
    procedure: [
      'the customer forgets to cancel and notices the renewal charge a few days later',
      'the customer complains about a charge after the period the terms give for it',
      'a card expires, the payment fails once and the account is suspended',
    ],
    combination: [
      'the provider raises the price, and the customer who wants to leave is inside a minimum term',
      'the account is closed for a breach of a rule of use while prepaid credit is left on it',
      'the customer loses data and the cap on liability is less than what was paid',
    ],
  },
};
