/**
 * State-level property assessor / parcel search portal links.
 *
 * These are best-effort starting points — most states lack a single statewide
 * parcel search, so the largest county or the most widely-used portal is used
 * as the default. The goal is to drop the user onto the right search form
 * quickly, not to pre-fill the query.
 */
export const STATE_ASSESSOR = {
  AL: "https://www.alabamagis.com/",
  AK: "https://dnr.alaska.gov/mlw/landrecords/",
  AZ: "https://mcassessor.maricopa.gov/",
  AR: "https://www.arcountydata.com/",
  CA: "https://assessor.lacounty.gov/parcel-search/",
  CO: "https://www.denvergov.org/Government/Agencies-Departments-Offices/Assessor",
  CT: "https://www.ctproperty.org/",
  DE: "https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx",
  FL: "https://www.bcpa.net/RecMenu.asp",
  GA: "https://www.qpublic.net/ga/",
  HI: "https://www.realpropertyhonolulu.com/",
  ID: "https://www.assessor.payette.id.us/",
  IL: "https://www.cookcountyassessor.com/",
  IN: "https://gateway.ifionline.org/",
  IA: "https://beacon.schneidercorp.com/",
  KS: "https://www.kslegislature.org/li/",
  KY: "https://pva.ky.gov/",
  LA: "https://www.latax.state.la.us/",
  ME: "https://www.maine.gov/revenue/taxes/property-taxes",
  MD: "https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx",
  MA: "https://www.cityofboston.gov/assessing/",
  MI: "https://www.michigan.gov/taxes/property",
  MN: "https://www.co.hennepin.mn.us/residents/property/property-information",
  MS: "https://www.mdah.ms.gov/maps",
  MO: "https://stlouis-mo.gov/government/departments/assessor/",
  MT: "https://svc.mt.gov/msl/mtcadastral/",
  NE: "https://www.lincoln.ne.gov/city/assessor/",
  NV: "https://www.clarkcountynv.gov/government/assessor",
  NH: "https://www.revenue.nh.gov/resource-library/municipal-tax-rates",
  NJ: "https://njactb.org/",
  NM: "https://www.bernco.gov/assessor/",
  NY: "https://www.tax.ny.gov/research/property/assess/valuation/default.htm",
  NC: "https://www.mecklenburgcountync.gov/government/departments/assessors-office",
  ND: "https://www.nd.gov/tax/user/businesses/realproperty",
  OH: "https://www.franklincoauditor.com/real-estate/",
  OK: "https://www.assessor.ok.gov/",
  OR: "https://www.multco.us/assessment-recording-taxation",
  PA: "https://www.alleghenycounty.us/real-estate/index.aspx",
  RI: "https://www.tax.ri.gov/",
  SC: "https://www.charlestoncounty.org/departments/assessor/",
  SD: "https://sdlegislature.gov/Statutes/Codified_Laws/",
  TN: "https://www.comptroller.tn.gov/office-functions/pa/property-assessment-data-tool.html",
  TX: "https://www.dallascad.org/",
  UT: "https://slco.org/assessor/",
  VT: "https://tax.vermont.gov/property-owners/listers-and-assessors",
  VA: "https://www.fairfaxcounty.gov/realestate/",
  WA: "https://info.kingcounty.gov/Assessor/esales/Glossary.aspx",
  WV: "https://www.wvsao.gov/CountyAssessors/default.aspx",
  WI: "https://www.revenue.wi.gov/Pages/SLF/PropAsmtSupport.aspx",
  WY: "https://www.laramiecounty.com/208/Assessor",
  DC: "https://www.taxpayerservicecenter.com/RP_Search.jsp",
};

/**
 * Returns the assessor portal URL for the given state, or null if unknown.
 * The URL links to the portal's search page — address lookup is done manually
 * by the user once they arrive.
 *
 * @param {string} state - Two-letter US state abbreviation (case-insensitive)
 * @returns {string|null}
 */
export function getAssessorUrl(state) {
  if (!state) return null;
  return STATE_ASSESSOR[state.toUpperCase()] ?? null;
}

/**
 * Returns true if a known assessor portal exists for the given state.
 *
 * @param {string} state - Two-letter US state abbreviation (case-insensitive)
 * @returns {boolean}
 */
export function hasAssessorLink(state) {
  return !!STATE_ASSESSOR[state?.toUpperCase()];
}
