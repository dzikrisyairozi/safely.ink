// Every article, in one list. The text is in ./<locale>/<slug>.mdx; this file
// holds what pages, the sitemap, RSS and llms.txt need to know about it.

export type PostLocaleMeta = { title: string; description: string };

export type Post = {
  slug: string;
  /** ISO date first published. */
  date: string;
  /** ISO date last changed in a way a reader would notice. */
  updated: string;
  tags: string[];
  en: PostLocaleMeta;
  id: PostLocaleMeta;
};

export const POSTS: Post[] = [
  {
    slug: 'what-is-a-policy-fuzzer',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['guides', 'how-it-works'],
    en: {
      title: 'What is a policy fuzzer, and why a summary is not enough',
      description:
        'Fuzzing comes from software testing. Here is how safely.ink uses it to find where a contract breaks, and why a summary cannot.',
    },
    id: {
      title: 'Apa itu policy fuzzer, dan mengapa ringkasan tidak cukup',
      description:
        'Fuzzing berasal dari pengujian perangkat lunak. Begini safely.ink memakainya untuk menemukan titik lemah kontrak yang luput dari ringkasan.',
    },
  },
  {
    slug: 'insurance-waiting-periods-and-late-notice',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['insurance'],
    en: {
      title: 'Insurance waiting periods and late notice: where claims fail',
      description:
        'Waiting periods, late notice, missing papers, lapsed premiums and sub-limits: the clauses that refuse or cut claims the policy covers.',
    },
    id: {
      title: 'Masa tunggu dan lapor terlambat: di mana klaim gagal',
      description:
        'Masa tunggu, lapor terlambat, berkas kurang, premi telat, dan sublimit: pasal-pasal yang bisa menolak atau memotong klaim yang ditanggung.',
    },
  },
  {
    slug: 'loan-agreement-late-fees-early-repayment',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['loans'],
    en: {
      title: 'Loan agreements: late fees, early repayment and rate changes',
      description:
        'One late payment, an early payoff or a rate change can cost far more than the first page suggests. The loan clauses to test before you sign.',
    },
    id: {
      title: 'Pinjaman: denda telat, pelunasan awal, dan perubahan bunga',
      description:
        'Satu kali telat bayar, pelunasan lebih awal, atau perubahan bunga bisa jauh lebih mahal dari kesan halaman pertama. Klausul yang perlu diuji.',
    },
  },
  {
    slug: 'employment-contract-notice-non-compete-training-bond',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['employment'],
    en: {
      title: 'Employment contracts: notice, non-competes, training bonds',
      description:
        'Resigning, being dismissed or taking a new job can trigger notice rules, a non-compete and a training-bond repayment at once. What to check.',
    },
    id: {
      title: 'Kontrak kerja: pemberitahuan, non-compete, ikatan dinas',
      description:
        'Mengundurkan diri atau pindah kerja bisa memicu aturan pemberitahuan, larangan bersaing, dan ganti rugi ikatan dinas sekaligus. Ini yang perlu dicek.',
    },
  },
  {
    slug: 'terms-and-conditions-clauses-that-matter',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['terms'],
    en: {
      title: 'Terms and conditions: the clauses that matter in a sign-up',
      description:
        'Renewal, changes to terms, refunds, liability caps, suspension, disputes and data: the sign-up clauses that decide what happens on a bad day.',
    },
    id: {
      title: 'Syarat dan ketentuan: klausul penting saat mendaftar',
      description:
        'Perpanjangan otomatis, perubahan ketentuan, pengembalian dana, batas tanggung jawab, penangguhan akun, dan sengketa: klausul yang menentukan nasib Anda.',
    },
  },
  {
    slug: 'nda-what-counts-as-confidential',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['nda'],
    en: {
      title: 'NDAs: what counts as confidential, and for how long',
      description:
        'How NDAs define confidential information, how long the duty lasts, which exceptions matter, and why your role changes what counts as a trap.',
    },
    id: {
      title: 'NDA: apa yang dianggap rahasia, dan sampai kapan',
      description:
        'Cara NDA mendefinisikan informasi rahasia, berapa lama kewajibannya berlaku, pengecualian yang penting, dan mengapa posisi Anda menentukan jebakannya.',
    },
  },
  {
    slug: 'rental-lease-when-deposit-can-be-kept',
    date: '2026-10-14',
    updated: '2026-10-14',
    tags: ['lease'],
    en: {
      title: 'Rental leases: when a deposit can be kept',
      description:
        'When a landlord can fairly keep a deposit: wear and tear versus damage, leaving early, repairs, rent increases and notice, with a worked example.',
    },
    id: {
      title: 'Sewa rumah: kapan deposit boleh ditahan',
      description:
        'Kapan pemilik boleh menahan deposit sewa: keausan wajar versus kerusakan, keluar lebih awal, perbaikan, kenaikan sewa, dan pemberitahuan.',
    },
  },
];
