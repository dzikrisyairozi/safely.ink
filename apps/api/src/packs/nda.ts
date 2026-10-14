import type { Pack } from './index';

export const nda: Pack = {
  facts: [
    'whether the information was marked or said to be confidential when it was shared',
    'whether the information was already public, or known to the receiving party before',
    'whether the receiving party learned it from someone else, or developed it on its own',
    'how many years have passed since the information was shared, or since the agreement ended',
    'whether the disclosure was on purpose or by accident, and to whom',
    'whether a court, regulator or the law required the disclosure',
    'whether the receiving party told the disclosing party at once after an accidental disclosure',
    'whether the information was shared with employees or advisers who needed it, under the same duty',
    'whether the information was used for something other than the purpose in the agreement',
    'whether the information and copies were returned or destroyed when asked',
    'the fixed penalty or damages for a breach, against the actual loss',
    'whether the agreement also stops the parties hiring each other’s staff or approaching clients',
  ],
  seeds: {
    baseline: [
      'the receiving party uses the information only for the deal and returns it when talks end',
      'the information becomes public through the disclosing party’s own announcement',
      'an employee who needs the information to evaluate the deal sees it under the same duty',
    ],
    overlap: [
      'the receiving party already knew part of the information, and the rest was new',
      'a regulator asks for the information, and the receiving party hands it over without warning the other side',
      'the information is used for the purpose in the agreement and, later, for a second project',
    ],
    definition: [
      'something said in a meeting and never marked confidential in writing',
      'general know-how the receiving party’s staff remember after the talks',
      'a public fact combined with a confidential one',
    ],
    procedure: [
      'an email with the information goes to the wrong person, and the receiving party reports it two weeks later',
      'the disclosing party asks for the files back, and backups are not deleted',
      'the receiving party asks for written permission to share with an adviser, and shares before the answer',
    ],
    combination: [
      'an accidental disclosure, years after the talks ended, with a fixed penalty far above any loss',
      'a former employee of the receiving party takes the information to a competitor',
      'the receiving party hires one of the disclosing party’s staff during the restriction',
    ],
  },
  hints: [
    'information that was already public, already known or found independently is not confidential',
    'the duty lasts a stated number of years, not forever, except for real trade secrets',
    'a disclosure the law requires is allowed, with notice to the other side where the law permits',
    'as the receiving party: an honest accident that is reported and fixed at once costs the actual loss, not a fixed penalty',
    'as the disclosing party: the other side may use the information only for the stated purpose and must give it back when asked',
    'as the disclosing party: a leak by the other side’s staff or advisers counts as the other side’s leak',
    'people accept that sharing confidential information on purpose has a real cost',
    'people accept that confidential information is shared only with those who need it',
  ],
};
