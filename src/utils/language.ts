/**
 * Language detection and validation utility to identify articles written in
 * languages other than English (e.g. Portuguese, Spanish, French, German, Italian, etc.)
 */

// Distinctive stopwords and function words by language
const PORTUGUESE_WORDS = new Set([
  'não', 'são', 'governador', 'desfile', 'desta', 'segunda-feira', 'terça-feira',
  'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo', 'eleição',
  'eleições', 'país', 'governo', 'polícia', 'ministério', 'prefeitura', 'câmara',
  'senado', 'saúde', 'educação', 'após', 'durante', 'contra', 'sobre', 'entre',
  'até', 'desde', 'quando', 'onde', 'quem', 'qual', 'como', 'mais', 'menos',
  'muito', 'pouco', 'tudo', 'nada', 'também', 'ainda', 'já', 'sempre', 'nunca',
  'ontem', 'hoje', 'amanhã', 'cidade', 'estado', 'pessoas', 'anos', 'acordo',
  'segundo', 'diz', 'disse', 'afirmou', 'reeleição', 'participou', 'militar',
  'realizado', 'manhã', 'norte', 'capital', 'com', 'para', 'pelo', 'pela', 'pelos', 'pelas',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'foi', 'foram', 'está', 'estão', 'tem', 'têm', 'havia', 'será', 'serão'
]);

const SPANISH_WORDS = new Set([
  'el', 'la', 'los', 'las', 'del', 'al', 'por', 'con', 'para', 'una', 'unos', 'unas',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
  'según', 'tras', 'sobre', 'contra', 'desde', 'hacia', 'hasta', 'durante', 'mediante',
  'entre', 'pero', 'aunque', 'sino', 'porque', 'pues', 'ya', 'además', 'también',
  'tampoco', 'jamás', 'nunca', 'siempre', 'hoy', 'ayer', 'mañana', 'después', 'antes',
  'ahora', 'país', 'gobierno', 'presidente', 'policía', 'ministro', 'dijo', 'afirmó',
  'anunció', 'fue', 'fueron', 'está', 'están', 'tiene', 'tienen', 'había', 'será', 'serán'
]);

const FRENCH_WORDS = new Set([
  'le', 'la', 'les', 'des', 'du', 'au', 'aux', 'un', 'une', 'ce', 'cet', 'cette', 'ces',
  'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'chez', 'vers', 'entre',
  'selon', 'depuis', 'pendant', 'devant', 'derrière', 'mais', 'donc', 'que', 'qui',
  'quoi', 'dont', 'où', 'quand', 'comment', 'pourquoi', 'très', 'trop', 'aussi',
  'encore', 'toujours', 'jamais', 'rien', 'tout', 'tous', 'toute', 'toutes',
  'gouvernement', 'président', 'pays', 'ville', 'a', 'été', 'ont', 'sont', 'est',
  'guerre', 'commerciale', 'malgré', 'santé', 'ministre', 'premier', 'première',
  'après', 'avant', 'faire', 'fait', 'dit', 'disent', 'leur', 'leurs', 'comme',
  'si', 'lui', 'elle', 'elles', 'ils', 'nous', 'vous', 'deux', 'trois', 'ans',
  'année', 'années', 'jour', 'jours', 'monde', 'national', 'nationale', 'états',
  'unis', 'américain', 'américaine', 'canadien', 'canadienne', 'québec', 'presse'
]);

const GERMAN_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'im', 'am', 'um', 'vom', 'zum', 'zur', 'beim', 'und', 'oder', 'aber', 'denn', 'doch',
  'jedoch', 'weil', 'dass', 'wenn', 'als', 'ob', 'während', 'seit', 'bis', 'nach', 'vor',
  'über', 'unter', 'zwischen', 'gegen', 'ohne', 'durch', 'für', 'mit', 'von', 'zu',
  'aus', 'bei', 'nicht', 'kein', 'keine', 'keinem', 'keinen', 'nichts', 'etwas', 'alles',
  'sehr', 'mehr', 'immer', 'wieder', 'heute', 'gestern', 'regierung', 'bundeskanzler', 'präsident'
]);

const ITALIAN_WORDS = new Set([
  'il', 'lo', 'la', 'gli', 'le', 'uno', 'una', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'allo', 'alla', 'agli', 'alle', 'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'con', 'per', 'tra', 'fra', 'non', 'che', 'chi', 'cui', 'quale', 'quali', 'questo', 'questa',
  'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'anche', 'sempre', 'mai',
  'oggi', 'ieri', 'domani', 'governo', 'presidente', 'stato', 'sono'
]);

const ENGLISH_WORDS = new Set([
  'the', 'and', 'of', 'to', 'a', 'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'at',
  'by', 'from', 'be', 'are', 'this', 'an', 'which', 'or', 'but', 'not', 'have', 'had', 'has',
  'they', 'were', 'their', 'will', 'would', 'its', 'who', 'more', 'been', 'says', 'said',
  'after', 'new', 'into', 'over', 'about', 'first', 'two', 'three', 'year', 'years', 'people'
]);

/**
 * Detects whether the provided text is in a language other than English.
 */
export function isNonEnglishText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const clean = text.trim();

  // 1. Non-Latin scripts (Cyrillic, Arabic, Hebrew, CJK, Kana, Hangul, Greek, Devanagari, Thai)
  const nonLatinMatch = clean.match(/[\u0400-\u04FF\u0600-\u06FF\u0590-\u05FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0370-\u03FF\u0900-\u097F\u0E00-\u0E7F]/g);
  if (nonLatinMatch && nonLatinMatch.length >= 3) {
    return true;
  }

  // 2. Tokenize words (lowercase, stripped of punctuation)
  const tokens = clean
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  if (tokens.length === 0) return false;

  let engScore = 0;
  let foreignScore = 0;

  for (const token of tokens) {
    if (ENGLISH_WORDS.has(token)) {
      engScore++;
    }
    if (
      PORTUGUESE_WORDS.has(token) ||
      SPANISH_WORDS.has(token) ||
      FRENCH_WORDS.has(token) ||
      GERMAN_WORDS.has(token) ||
      ITALIAN_WORDS.has(token)
    ) {
      foreignScore++;
    }
  }

  // If foreign indicators outnumber English words or are prominent
  if (foreignScore >= 2 && foreignScore >= engScore) {
    return true;
  }

  if (foreignScore >= 4) {
    return true;
  }

  // Accented Latin characters specific to Romance/Germanic languages (e.g. ã, õ, ç, é, è, ê, á, à, ü, ö, ä)
  const accentedMatch = clean.match(/[ãõçéèêáàíóúâôüöäñ]/gi);
  if (accentedMatch && accentedMatch.length >= 3 && engScore === 0) {
    return true;
  }

  return false;
}
