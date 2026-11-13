import { LIMITS, type EditableSettings, type IssueRow, type RunRow, type SubscriberRow } from '../admin/settings'
import { SECTIONS } from '../generate/types'
import { LABELS } from '../i18n'
import { Layout } from './pages'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const range = ([min, max]: readonly [number, number]) => Array.from({ length: max - min + 1 }, (_, i) => min + i)

export type Flash = { kind: 'ok' | 'err'; text: string }

function FlashMessage(props: { flash?: Flash }) {
  return props.flash ? <p class={props.flash.kind === 'err' ? 'msg err' : 'msg'}>{props.flash.text}</p> : null
}

export function LoginPage(props: { flash?: Flash }) {
  return (
    <Layout lang="fr" title="Admin · Dev Agents Weekly">
      <div class="card">
        <span class="brand">Dev Agents Weekly · Admin</span>
        <h1>Connexion</h1>
        <FlashMessage flash={props.flash} />
        <form method="post" action="/admin/login">
          <label for="token">Jeton d'administration</label>
          <input id="token" name="token" type="password" autocomplete="current-password" required />
          <button class="btn" type="submit">
            Se connecter
          </button>
        </form>
      </div>
    </Layout>
  )
}

export function AdminPage(props: {
  settings: EditableSettings & { timezone: string }
  subscribers: SubscriberRow[]
  issues: IssueRow[]
  runs: RunRow[]
  flash?: Flash
}) {
  const { settings: s } = props
  return (
    <Layout lang="fr" title="Admin · Dev Agents Weekly">
      <div class="card">
        <span class="brand">Dev Agents Weekly · Admin</span>
        <h1>Tableau de bord</h1>
        <FlashMessage flash={props.flash} />

        <h2>Envoi immédiat</h2>
        <p>Génère un nouveau numéro et l'envoie tout de suite à tous les destinataires actifs.</p>
        <form method="post" action="/admin/send-now">
          <button class="btn" type="submit">
            Envoyer maintenant
          </button>
        </form>

        <h2>Envoi</h2>
        <form method="post" action="/admin/settings">
          <label for="send_day">Jour d'envoi</label>
          <select id="send_day" name="send_day">
            {DAYS.map((d, i) => (
              <option value={String(i + 1)} selected={s.sendDay === i + 1}>
                {d}
              </option>
            ))}
          </select>
          <label for="send_hour">Heure ({s.timezone})</label>
          <select id="send_hour" name="send_hour">
            {range(LIMITS.sendHour).map((h) => (
              <option value={String(h)} selected={s.sendHour === h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <label for="frequency_weeks">Fréquence (toutes les N semaines)</label>
          <select id="frequency_weeks" name="frequency_weeks">
            {range(LIMITS.frequencyWeeks).map((n) => (
              <option value={String(n)} selected={s.frequencyWeeks === n}>
                {n}
              </option>
            ))}
          </select>
          <label for="language">Langue</label>
          <select id="language" name="language">
            <option value="fr" selected={s.language === 'fr'}>
              Français
            </option>
            <option value="en" selected={s.language === 'en'}>
              English
            </option>
          </select>

          <h2>Contenu du numéro</h2>
          <p>
            Un numéro automatique n'est envoyé que s'il compte au moins 3 éléments, dont 1 Claude Code : avec 1 élément par section,
            le moindre élément manquant annule l'envoi.
          </p>
          {SECTIONS.map((section) => (
            <>
              <label for={`count_${section}`}>{LABELS.fr.sections[section]} (nombre d'éléments)</label>
              <select id={`count_${section}`} name={`count_${section}`}>
                {range(LIMITS.sectionCount).map((n) => (
                  <option value={String(n)} selected={s.sectionCounts[section] === n}>
                    {n}
                  </option>
                ))}
              </select>
            </>
          ))}
          <button class="btn" type="submit">
            Enregistrer
          </button>
        </form>

        <h2>Destinataires</h2>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.subscribers.map((sub) => (
              <tr>
                <td>{sub.email}</td>
                <td>{sub.active ? 'Actif' : 'Désinscrit'}</td>
                <td>
                  <form method="post" action={`/admin/subscribers/${sub.id}/${sub.active ? 'deactivate' : 'activate'}`}>
                    <button class="btn ghost" type="submit">
                      {sub.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form method="post" action="/admin/subscribers">
          <label for="email">Ajouter un destinataire</label>
          <input id="email" name="email" type="email" required />
          <button class="btn" type="submit">
            Ajouter
          </button>
        </form>

        <h2>Numéros</h2>
        <table>
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Statut</th>
              <th>Envoyé</th>
            </tr>
          </thead>
          <tbody>
            {props.issues.map((i) => (
              <tr>
                <td>{i.status === 'draft' ? i.id : <a href={`/issue/${i.id}`}>{i.id}</a>}</td>
                <td>{i.status}</td>
                <td>{i.sent_at ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Dernières exécutions</h2>
        <table>
          <thead>
            <tr>
              <th>Début (UTC)</th>
              <th>Statut</th>
              <th>Coût</th>
            </tr>
          </thead>
          <tbody>
            {props.runs.map((r) => (
              <tr>
                <td>{r.started_at}</td>
                <td>
                  {r.status}
                  {r.error ? <div style="color:var(--muted)">{r.error.slice(0, 200)}</div> : null}
                </td>
                <td>{r.llm_cost_usd === null ? '—' : `$${r.llm_cost_usd.toFixed(3)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <form method="post" action="/admin/logout">
          <button class="btn ghost" type="submit" style="margin-top:24px">
            Se déconnecter
          </button>
        </form>
      </div>
    </Layout>
  )
}
