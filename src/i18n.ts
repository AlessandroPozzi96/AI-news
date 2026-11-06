import type { Category, Language, Section } from './generate/types'

export const BRAND = 'Dev Agents Weekly'

export type Labels = {
  tagline: string
  categories: Record<Category, string>
  sections: Record<Section, string>
  claudeCode: string
  readMore: string
  keyPoints: string
  commands: string
  whyItMatters: string
  source: string
  backToIssue: string
  viewInBrowser: string
  unsubscribe: string
  footerNote: string
  weekLabel: string
  notFound: string
  unsubTitle: string
  unsubBody: string
  unsubButton: string
  unsubDone: string
  unsubInvalid: string
}

export const LABELS: Record<Language, Labels> = {
  fr: {
    tagline: "L'essentiel de la semaine sur les agents IA pour développeurs",
    categories: {
      model: 'Modèle',
      skill_tool: 'Skill / Outil',
      best_practice: 'Bonne pratique',
      command_shortcut: 'Commande',
      other: 'Actu',
    },
    sections: { news: 'Actualités', must_have: 'Indispensables', claude_code: 'Claude Code' },
    claudeCode: 'Claude Code',
    readMore: 'Lire la suite',
    keyPoints: 'À retenir',
    commands: 'Commandes',
    whyItMatters: 'Pourquoi ça compte',
    source: 'Source originale',
    backToIssue: 'Retour au numéro',
    viewInBrowser: 'Voir dans le navigateur',
    unsubscribe: 'Se désabonner',
    footerNote: 'Vous recevez cet e-mail car vous êtes abonné à cette newsletter.',
    weekLabel: 'Semaine',
    notFound: 'Page introuvable',
    unsubTitle: 'Se désabonner',
    unsubBody: 'Confirmez-vous ne plus vouloir recevoir cette newsletter ?',
    unsubButton: 'Me désabonner',
    unsubDone: 'Vous êtes désabonné. Vous ne recevrez plus cette newsletter.',
    unsubInvalid: 'Ce lien de désinscription est invalide.',
  },
  en: {
    tagline: 'The week in AI agents for software developers',
    categories: {
      model: 'Model',
      skill_tool: 'Skill / Tool',
      best_practice: 'Best practice',
      command_shortcut: 'Command',
      other: 'News',
    },
    sections: { news: 'News', must_have: 'Must-haves', claude_code: 'Claude Code' },
    claudeCode: 'Claude Code',
    readMore: 'Read more',
    keyPoints: 'Key points',
    commands: 'Commands',
    whyItMatters: 'Why it matters',
    source: 'Original source',
    backToIssue: 'Back to the issue',
    viewInBrowser: 'View in browser',
    unsubscribe: 'Unsubscribe',
    footerNote: 'You are receiving this email because you subscribed to this newsletter.',
    weekLabel: 'Week',
    notFound: 'Page not found',
    unsubTitle: 'Unsubscribe',
    unsubBody: 'Do you confirm you no longer want to receive this newsletter?',
    unsubButton: 'Unsubscribe me',
    unsubDone: 'You are unsubscribed. You will no longer receive this newsletter.',
    unsubInvalid: 'This unsubscribe link is invalid.',
  },
}

export const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB' }
