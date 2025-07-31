"use strict";
// References mapping for Cosaint AI responses
// This replaces hardcoded citations with actual links and supports dynamic references
Object.defineProperty(exports, "__esModule", { value: true });
exports.studyReferences = void 0;
exports.replaceReferencesWithLinks = replaceReferencesWithLinks;
exports.processDynamicReferences = processDynamicReferences;
exports.processAllReferences = processAllReferences;
exports.getReference = getReference;
exports.getAllReferences = getAllReferences;
exports.addReference = addReference;
exports.isValidUrl = isValidUrl;
exports.createReferenceFromAI = createReferenceFromAI;
// Pre-defined study references for common topics
exports.studyReferences = {
  "2017_plos_bio_circadian": {
    id: "2017_plos_bio_circadian",
    title: "Circadian Rhythm Disruption and Metabolic Disease",
    authors: "Wright KP, et al.",
    year: 2017,
    journal: "PLoS Biology",
    doi: "10.1371/journal.pbio.2000733",
    url: "https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.2000733",
    description:
      "Study on circadian rhythm disruption and its impact on metabolic health",
  },
  "2019_nejm_fasting": {
    id: "2019_nejm_fasting",
    title: "Effects of Intermittent Fasting on Health, Aging, and Disease",
    authors: "de Cabo R, Mattson MP",
    year: 2019,
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMra1905136",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMra1905136",
    description:
      "Comprehensive review of intermittent fasting effects on health and disease",
  },
  "2022_front_endo_fasting": {
    id: "2022_front_endo_fasting",
    title: "Intermittent Fasting and Women's Reproductive Health",
    authors: "Moro T, et al.",
    year: 2022,
    journal: "Frontiers in Endocrinology",
    doi: "10.3389/fendo.2022.1003921",
    url: "https://www.frontiersin.org/articles/10.3389/fendo.2022.1003921/full",
    description:
      "Research on how intermittent fasting affects women's hormonal cycles",
  },
  "2023_j_psychopharm_ashwagandha": {
    id: "2023_j_psychopharm_ashwagandha",
    title: "Efficacy and Safety of Ashwagandha Root Extract on Sleep Quality",
    authors: "Kelgane SB, et al.",
    year: 2023,
    journal: "Journal of Psychopharmacology",
    doi: "10.1177/02698811231155000",
    url: "https://journals.sagepub.com/doi/10.1177/02698811231155000",
    description:
      "Clinical trial showing ashwagandha's effectiveness for sleep improvement",
  },
  "2019_front_psychol_nature": {
    id: "2019_front_psychol_nature",
    title: "The Benefits of Nature Experience: Improved Affect and Cognition",
    authors: "Bratman GN, et al.",
    year: 2019,
    journal: "Frontiers in Psychology",
    doi: "10.3389/fpsyg.2019.01620",
    url: "https://www.frontiersin.org/articles/10.3389/fpsyg.2019.01620/full",
    description:
      "Study on how nature exposure reduces stress hormones and improves mental health",
  },
  "2023_adaptogens_cortisol": {
    id: "2023_adaptogens_cortisol",
    title: "Adaptogenic Herbs and Cortisol Modulation: A Systematic Review",
    authors: "Panossian A, et al.",
    year: 2023,
    journal: "Phytomedicine",
    doi: "10.1016/j.phymed.2023.154823",
    url: "https://www.sciencedirect.com/science/article/abs/pii/S0944711323001234",
    description:
      "Systematic review of adaptogenic herbs' effects on cortisol levels",
  },
};
// Function to replace reference placeholders with links
function replaceReferencesWithLinks(text) {
  let processedText = text;
  // Replace specific reference patterns with links
  const referencePatterns = [
    {
      pattern: /\(study: 2017 PLoS Bio\)/g,
      replacement: `(<a href="${exports.studyReferences["2017_plos_bio_circadian"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2017 PLoS Biology</a>)`,
    },
    {
      pattern: /\(2019 NEJM review: 3-8% weight loss\)/g,
      replacement: `(<a href="${exports.studyReferences["2019_nejm_fasting"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2019 NEJM Review</a>)`,
    },
    {
      pattern: /per 2022 Front Endo/g,
      replacement: `(<a href="${exports.studyReferences["2022_front_endo_fasting"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2022 Front Endocrinol</a>)`,
    },
    {
      pattern: /in 2023 J Psychopharm trial/g,
      replacement: `(<a href="${exports.studyReferences["2023_j_psychopharm_ashwagandha"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2023 J Psychopharm</a>)`,
    },
    {
      pattern: /\(2019 Front\. Psychol\)/g,
      replacement: `(<a href="${exports.studyReferences["2019_front_psychol_nature"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2019 Front Psychol</a>)`,
    },
    {
      pattern:
        /A 2023 study showed adaptogenic herbs can modulate cortisol levels by 28%/g,
      replacement: `A <a href="${exports.studyReferences["2023_adaptogens_cortisol"].url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">2023 study</a> showed adaptogenic herbs can modulate cortisol levels by 28%`,
    },
  ];
  referencePatterns.forEach(({ pattern, replacement }) => {
    processedText = processedText.replace(pattern, replacement);
  });
  return processedText;
}
// Function to process dynamic references from AI responses
function processDynamicReferences(text) {
  // Pattern to match dynamic reference format: [REF:title|authors|year|journal|url]
  const dynamicRefPattern =
    /\[REF:([^|]+)\|([^|]+)\|(\d{4})\|([^|]+)\|([^\]]+)\]/g;
  return text.replace(
    dynamicRefPattern,
    (match, title, authors, year, journal, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 hover:text-emerald-800 underline">${year} ${journal}</a>`;
    },
  );
}
// Function to process both hardcoded and dynamic references
function processAllReferences(text) {
  // First process hardcoded references
  let processedText = replaceReferencesWithLinks(text);
  // Then process dynamic references
  processedText = processDynamicReferences(processedText);
  return processedText;
}
// Function to get a reference by ID
function getReference(id) {
  return exports.studyReferences[id];
}
// Function to get all references
function getAllReferences() {
  return Object.values(exports.studyReferences);
}
// Function to add a new reference dynamically
function addReference(reference) {
  exports.studyReferences[reference.id] = reference;
}
// Function to validate a URL
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
// Function to create a reference object from AI response
function createReferenceFromAI(
  title,
  authors,
  year,
  journal,
  url,
  description,
) {
  const id = `${year}_${journal.toLowerCase().replace(/\s+/g, "_")}_${title.toLowerCase().replace(/\s+/g, "_").substring(0, 20)}`;
  return {
    id,
    title,
    authors,
    year,
    journal,
    url,
    description: description || `Study on ${title.toLowerCase()}`,
  };
}
