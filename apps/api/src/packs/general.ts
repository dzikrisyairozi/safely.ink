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
};
