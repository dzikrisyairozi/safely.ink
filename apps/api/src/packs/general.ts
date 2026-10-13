import type { Pack } from './index';

// For a contract that has no pack of its own.
export const general: Pack = {
  facts: [
    'how long the agreement has run when the event happens',
    'whether the user ends the agreement early, and with how many days of notice',
    'whether the agreement renews on its own, and how to stop that',
    'whether the user paid late, and the fee or interest for it',
    'whether the other party changed a price, a rate or a term on its own',
    'whether the other party ended the agreement, and for what stated reason',
    'the amount the user lost, against any cap on what the other party owes',
    'whether the user met each obligation the agreement puts on them',
    'whether the user gave a required notice in the required form and time',
    'whether money the user handed over (a deposit, a prepayment) is returned',
    'where and how a dispute must be brought',
  ],
  seeds: {
    baseline: [
      'both sides do what the agreement says for its whole term',
      'the user ends the agreement with the notice it asks for',
    ],
    overlap: [
      'the user is allowed to do something, but one detail of how they did it is not allowed',
      'the user meets an obligation late because the other party was late first',
    ],
    definition: [
      'a situation at the edge of a term the agreement defines',
      'something the user takes for normal use and the agreement may call a breach',
    ],
    procedure: [
      'a notice given a few days late, or by message when the agreement asks for a letter',
      'a payment a few days late',
      'a required document or approval is missing',
    ],
    combination: [
      'the user leaves early and a fee, a lost deposit and a notice period apply together',
      'the other party changes a term and the user who objects is still bound for months',
    ],
  },
};
