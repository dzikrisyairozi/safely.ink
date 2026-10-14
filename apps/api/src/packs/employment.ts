import type { Pack } from './index';

export const employment: Pack = {
  facts: [
    'how many months the employee has worked when the event happens',
    'whether the employee is still on probation',
    'how many days of notice the employee gives when resigning',
    'how many days of notice or pay in lieu the employer gives when dismissing',
    'the stated reason for a dismissal, and whether a warning came first',
    'whether the employee leaves before the end of a training bond, and what the training cost',
    'where and for whom the employee works after leaving, and how long after',
    'whether the employee contacts former clients or colleagues after leaving',
    'how many hours a week the employee works beyond the contract, and whether that is paid',
    'how many days of leave are left when the employment ends',
    'whether something the employee made on their own time is claimed by the employer',
    'whether the employer cut pay, changed the role or moved the place of work on its own',
    'the bonus or commission earned but not yet paid when the employment ends',
  ],
  seeds: {
    baseline: [
      'the employee resigns after three years with the full notice the contract asks for',
      'the employee finishes probation and is confirmed',
      'the employee takes their annual leave in the year it is earned',
    ],
    overlap: [
      'the employee resigns with full notice, and the employer ends the job at once without paying the notice period',
      'the employee is dismissed for poor performance a week after a medical leave',
      'the employee leaves after a training bond ends, and a second course added later restarts it',
    ],
    definition: [
      'a new job at a company that sells something different but to the same customers',
      'a side project built at home on a personal laptop',
      'messages answered in the evening that the employer does not count as overtime',
    ],
    procedure: [
      'the resignation is sent by message instead of a signed letter',
      'the employee is dismissed without a written warning first',
      'the employee claims unpaid overtime months after the end of the pay period',
    ],
    combination: [
      'the employee leaves early, repays the training bond, loses the bonus and is held to a non-compete',
      'the employer moves the job to another city, and the employee who refuses is treated as resigning',
      'the employee is dismissed during probation with leave and commission still unpaid',
    ],
  },
  hints: [
    'an employee can resign with the notice the contract states, and is paid until the last day',
    'dismissal needs a fair reason and, for performance, a warning and a chance to improve',
    'pay, role and place of work do not change without the employee agreeing',
    'a training bond asks back no more than the training cost, less for the time already served',
    'a non-compete is short, local and limited to the same kind of work',
    'earned leave, bonus and commission are paid out when the employment ends',
    'as an employer: an employee does not take clients or confidential files on leaving',
    'people accept probation, a notice period and that serious misconduct ends the job at once',
  ],
};
