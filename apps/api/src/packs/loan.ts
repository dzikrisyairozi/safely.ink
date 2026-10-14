import type { Pack } from './index';

export const loan: Pack = {
  facts: [
    'how many days an instalment was paid late, and how many instalments were late',
    'the late fee or default interest charged for it',
    'whether the borrower repays part or all of the loan early, and the fee for that',
    'whether the lender changed the interest rate, and with how many days of notice',
    'whether the rate is fixed or floating, and for how long it is fixed',
    'the amount still owed when the event happens',
    'whether the lender declared the whole loan due at once (acceleration)',
    'what counts as default: missed payments, a false statement, another debt in default',
    'what the collateral is worth against the amount owed, and whether it was sold',
    'whether a guarantor is asked to pay, and before or after the lender goes after the borrower',
    'whether the lender took money from another account of the borrower (set-off)',
    'whether the borrower lost income or fell ill, and asked for a payment break',
    'fees taken from the loan at the start (provision, admin, insurance)',
  ],
  seeds: {
    baseline: [
      'every instalment is paid on time until the loan ends',
      'the borrower repays the whole loan early, after giving the notice the agreement asks for',
      'the borrower pays one instalment a day late after a bank holiday',
    ],
    overlap: [
      'the borrower pays a late instalment in full, and the lender still charges default interest on the whole loan',
      'the borrower repays early during the fixed-rate period, when a break fee applies',
      'a guarantor is asked to pay while the borrower is still paying, but late',
    ],
    definition: [
      'a payment that arrives on the due date but after the cut-off time',
      'a small debt elsewhere goes unpaid, and the agreement calls that a default here too',
      'a change of job or address the borrower did not report, which the agreement calls a breach',
    ],
    procedure: [
      'the lender raises the rate with a notice the borrower never received',
      'the borrower asks for a payment break after losing their job, by phone instead of in writing',
      'the borrower disputes a fee after the period the agreement gives for complaints',
    ],
    combination: [
      'two late instalments make the whole loan due, with default interest and collection costs on top',
      'the collateral is sold below its value, and the borrower still owes the rest',
      'the rate rises and the borrower who wants to leave pays an early repayment fee',
    ],
  },
  hints: [
    'one payment a few days late costs a late fee, not the whole loan falling due',
    'a borrower can repay early, and any fee for it is about what the lender actually loses',
    'a rate change is announced in advance, and a fixed rate stays fixed for its period',
    'collateral is sold for a fair price, and anything above the debt goes back to the borrower',
    'as a guarantor: the lender asks the borrower first and tells the guarantor before the debt grows',
    'money in another account is not taken without notice',
    'people accept that a missed payment costs interest and a fee stated in the agreement',
    'people accept that a loan that is not paid for months can be called in and the collateral sold',
  ],
};
