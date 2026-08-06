// Tutorial pages (always-optional onboarding). Client-only chrome content,
// mirroring the EN/ES parity discipline of src/i18n/strings.ts: every `title`
// and `body` needs a non-empty `en` AND `es`. Spanish uses the Rioplatense
// `vos` voice used throughout. `icon` is a semantic lucide name resolved via
// AchIcon (falls back to Sparkles if unbound).

export interface TutorialPage {
  id: string
  icon: string
  title: { en: string; es: string }
  body: { en: string; es: string }
}

export const TUTORIAL_PAGES: TutorialPage[] = [
  {
    id: "welcome",
    icon: "flame",
    title: { en: "A life, one turn at a time", es: "Una vida, turno a turno" },
    body: {
      en: "Ballad of the Unnamed is a life you walk turn by turn. You begin at sixteen with a name, a class and a homeland — and every choice from here shapes who you become. There are no perfect answers, only the road you take.",
      es: "La Balada del Innombrado es una vida que se juega turno a turno. Arrancás a los dieciséis con un nombre, una clase y una tierra — y cada decisión de aquí en adelante te va moldeando. No hay respuestas perfectas, solo el camino que elegís.",
    },
  },
  {
    id: "choices",
    icon: "scroll-text",
    title: { en: "Everything is a decision", es: "Todo es una decisión" },
    body: {
      en: "Events lay out several ways forward. Some are safe, some risky. Some open doors only a certain character can pass through. Consequences land on your stats, your gold, your reputation — and on what the world thinks of you.",
      es: "Los eventos te ofrecen varias formas de actuar. Algunas son seguras, otras arriesgadas. Algunas abren puertas que solo cierto tipo de héroe puede cruzar. Cada elección deja huella en tus atributos, tu oro, tu reputación — y en lo que el mundo piensa de vos.",
    },
  },
  {
    id: "stats",
    icon: "brain",
    title: { en: "Your attributes", es: "Tus atributos" },
    body: {
      en: "Strength, Dexterity, Constitution, Intelligence and Charisma. They grow as your story does, and a high enough attribute can unlock choices that stay hidden to others. Watch them — they decide what paths open before you.",
      es: "Fuerza, Destreza, Constitución, Inteligencia y Carisma. Crecen con tu historia, y un atributo lo bastante alto puede desbloquear opciones que para otros siguen ocultas. Cuidalos — ellos deciden qué caminos se abren frente a vos.",
    },
  },
  {
    id: "meters",
    icon: "heart",
    title: { en: "Your meters", es: "Tus indicadores" },
    body: {
      en: "Gold funds your road. Stamina decides how much you can push on. Momentum rises and falls with your fortune. Reputation tracks how each clan sees you. And your liability — the things you did — lingers long after the coin is spent.",
      es: "El oro sostiene tu camino. La energía decide cuánto podés exigirte. El impulso sube y cae con tu suerte. La reputación marca cómo te ve cada clan. Y tu expediente — lo que hiciste — sigue ahí mucho después de gastado el dinero.",
    },
  },
  {
    id: "daily",
    icon: "crown",
    title: { en: "A shared day", es: "Un día compartido" },
    body: {
      en: "Every day brings the same fate to all who play. On a daily season you walk the same road the world walks together — same rolls, same skies. Your rivals live in it too, growing just off the page.",
      es: "Cada día reparte el mismo destino para todos. En una temporada diaria caminás la misma ruta que el resto del mundo — mismas jugadas, mismas costumbres. Tus rivales también viven en ella, creciendo justo fuera de la página.",
    },
  },
  {
    id: "ending",
    icon: "handshake",
    title: { en: "Your story is the prize", es: "Tu historia es el premio" },
    body: {
      en: "There is no final answer to seek. A character retires, or falls, or becomes a legend — and the ballad remembers. Whatever else you win, the name you build is what stays sung. Begin when you are ready.",
      es: "No hay una respuesta final que buscar. Un personaje se retira, o cae, o se vuelve leyenda — y la balada se lo lleva. Lo que sea que ganes, el nombre que construyas es lo que queda cantado. Empezá cuando estés listo.",
    },
  },
]
