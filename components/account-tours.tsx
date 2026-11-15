"use client";

import { useTonyTours } from "./tony-tour-provider";
import { tourLabels, tourSections } from "@/lib/tony-tours";
import { Button } from "./ui/button";
import styles from "./tony-tour.module.css";

export function AccountTours({ onReplay, disabled = false }: { onReplay: () => void; disabled?: boolean }) {
  const { requestTour, loading, error, reload } = useTonyTours();
  return <section className={styles.account} aria-label="Tour di Tony">
    <h3>Tour di Tony</h3><p>Vuoi rivedere un passaggio? Ti accompagno di nuovo nella sezione che scegli. Per Esame e PDF aprirò la materia corrente o il primo materiale disponibile.</p>
    <div>{tourSections.map(section => <Button key={section} variant="outline" size="sm" disabled={disabled} onClick={() => { onReplay(); requestTour(section); }}>Rifai tour {tourLabels[section]}</Button>)}</div>
    {loading && <p role="status">Caricamento delle preferenze dei tour…</p>}
    {error && <p role="alert">{error} <Button variant="ghost" size="sm" onClick={() => void reload()}>Riprova</Button></p>}
  </section>;
}
