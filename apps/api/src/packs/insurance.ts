import type { Pack } from './index';

export const insurance: Pack = {
  facts: [
    'how long the policy has been in force when the event happens (waiting periods)',
    'what caused the loss, with the causes the policy excludes',
    'whether the condition existed before the policy started',
    'whether the insured answered every question on the application truthfully',
    'how many days passed between the event and the notice to the insurer',
    'whether every required document was submitted, and how late',
    'whether the premium was paid on time, and whether the policy had lapsed',
    'the amount claimed, against the limit for that kind of cost',
    'the deductible or the share the insured pays',
    'whether treatment or repair was done by a provider the insurer approved',
    'where the event happened, when cover is limited to a territory',
    'what the insured was doing at the time (excluded activities, intoxication)',
    'whether another policy covers the same loss',
  ],
  seeds: {
    baseline: [
      'an ordinary admission well after the policy started, with notice and documents in time',
      'a small claim at a network hospital, paid directly',
      'an accident in the first week of the policy',
    ],
    overlap: [
      'a covered illness made worse by something the policy excludes',
      'an accident on holiday while doing a sport the policy lists as hazardous',
      'a covered treatment given partly at a provider the insurer did not approve',
    ],
    definition: [
      'a hospital stay just short of what the policy calls an admission',
      'a symptom noticed before the policy started, diagnosed only afterwards',
      'an emergency abroad on a trip slightly longer than the policy allows',
    ],
    procedure: [
      'the insurer is told a few days after the notice period ended, because the insured was in hospital',
      'one receipt or the medical report is missing when the claim is sent',
      'the premium is paid a few days after the grace period and the event happens in between',
    ],
    combination: [
      'a large claim that meets a sub-limit and the deductible at once',
      'a late notice on a claim that would otherwise be paid in full',
      'an honest mistake on the application, found when an unrelated claim is made',
    ],
  },
};
