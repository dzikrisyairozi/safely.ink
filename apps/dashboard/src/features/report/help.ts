import type { DocType, LawJurisdiction } from '@repo/api-types';

export type Help = { name: string; url: string };

// Official bodies and recognised services, checked by hand on 2026-10-14.
// Some sites turn away scripts (a firewall or a Cloudflare check) but open in
// a browser: kontak157.ojk.go.id, case.org.sg, afca.org.au, bphn.go.id.
const OJK = {
  name: 'Otoritas Jasa Keuangan (Kontak OJK 157)',
  url: 'https://kontak157.ojk.go.id',
};
const LAPS = {
  name: 'LAPS SJK (financial services disputes)',
  url: 'https://lapssjk.id',
};
const KEMNAKER = {
  name: 'Kementerian Ketenagakerjaan',
  url: 'https://kemnaker.go.id',
};
const BPKN = {
  name: 'Badan Perlindungan Konsumen Nasional',
  url: 'https://bpkn.go.id',
};
const YLKI = {
  name: 'Yayasan Lembaga Konsumen Indonesia',
  url: 'https://ylki.or.id',
};
const BPHN = {
  name: 'Badan Pembinaan Hukum Nasional (legal aid)',
  url: 'https://bphn.go.id',
};

const FIDREC = {
  name: 'Financial Industry Disputes Resolution Centre (FIDReC)',
  url: 'https://www.fidrec.com.sg',
};
const TADM = {
  name: 'Tripartite Alliance for Dispute Management (TADM)',
  url: 'https://www.tal.sg/tadm',
};
const MOM = {
  name: 'Ministry of Manpower',
  url: 'https://www.mom.gov.sg/employment-practices',
};
const CASE = {
  name: 'Consumers Association of Singapore (CASE)',
  url: 'https://www.case.org.sg',
};
const SCT = {
  name: 'Small Claims Tribunals',
  url: 'https://www.judiciary.gov.sg/civil/small-claims',
};
const PRO_BONO_SG = { name: 'Pro Bono SG', url: 'https://www.probono.sg' };

const AFCA = {
  name: 'Australian Financial Complaints Authority (AFCA)',
  url: 'https://www.afca.org.au',
};
const FWO = {
  name: 'Fair Work Ombudsman',
  url: 'https://www.fairwork.gov.au',
};
const ACCC = {
  name: 'Australian Competition and Consumer Commission (ACCC)',
  url: 'https://www.accc.gov.au',
};
const LEGAL_AID_AU = {
  name: 'National Legal Aid',
  url: 'https://nationallegalaid.org.au',
};

/** Where to get help about a document of that type in that country (F-REP-4). */
export const HELP: Record<LawJurisdiction, Record<DocType, Help[]>> = {
  ID: {
    insurance: [OJK, LAPS],
    loan: [OJK, LAPS],
    employment: [KEMNAKER, BPHN],
    nda: [BPHN],
    lease: [BPHN],
    terms: [BPKN, YLKI],
    other: [BPKN, BPHN],
  },
  SG: {
    insurance: [FIDREC],
    loan: [FIDREC],
    employment: [TADM, MOM],
    nda: [PRO_BONO_SG],
    lease: [SCT, PRO_BONO_SG],
    terms: [CASE, SCT],
    other: [CASE, PRO_BONO_SG],
  },
  AU: {
    insurance: [AFCA],
    loan: [AFCA],
    employment: [FWO],
    nda: [LEGAL_AID_AU],
    lease: [LEGAL_AID_AU],
    terms: [ACCC],
    other: [ACCC, LEGAL_AID_AU],
  },
};
