/**
 * Garde l'offre d'installation du navigateur (Android) dès le chargement de la
 * page : elle arrive souvent avant que la page soit interactive, et une seule
 * fois. Les bandeaux « Installer l'application » la reprennent ensuite.
 */
const SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event("install-prompt-ready"))});window.addEventListener("appinstalled",function(){window.__installPrompt=null})`;

export function InstallCapture() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
