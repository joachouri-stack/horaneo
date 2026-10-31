import { notFound } from "next/navigation";

/**
 * Adresse inconnue du site commercial : affiche notre page « introuvable » (traduite, avec
 * l'en-tête et le pied de page) au lieu de la page par défaut de Next.js, en anglais.
 */
export default function UnknownPage() {
  notFound();
}
