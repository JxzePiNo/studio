"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Link, MessageCircle, QrCode, Share2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import styles from "./friends.module.css";

export function ShareProfile({ uid, discoverable }: { uid: string; discoverable: boolean }) {
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  return <Dialog.Root onOpenChange={open => { if (open) { setUrl(`${window.location.origin}/amici?profilo=${encodeURIComponent(uid)}`); setNotice(""); } }}>
    <Dialog.Trigger asChild><Button variant="outline" size="sm"><Share2 size={14} /> Condividi profilo</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="account-profile-overlay" /><Dialog.Content className="account-profile-dialog">
      <Dialog.Close className="account-profile-close icon-button" aria-label="Chiudi condivisione profilo"><X size={18} /></Dialog.Close>
      <Dialog.Title>Condividi profilo</Dialog.Title>
      <Dialog.Description>Invia il tuo link o fai scansionare il QR-Code per ricevere una richiesta di amicizia.</Dialog.Description>
      {!discoverable ? <p>Attiva “Compari nella ricerca e nei suggerimenti” nelle impostazioni amici per condividere il profilo.</p> : <Tabs defaultValue="link" className={styles.shareProfile}>
        <TabsList aria-label="Modalità di condivisione"><TabsTrigger value="link"><Link size={15} /> Link</TabsTrigger><TabsTrigger value="qr"><QrCode size={15} /> QR-Code</TabsTrigger></TabsList>
        <TabsContent value="link"><label htmlFor="share-profile-link">Il tuo link personale</label><div className={styles.shareLink}><Input id="share-profile-link" readOnly value={url} onFocus={event => event.currentTarget.select()} /><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice("Link copiato."); } catch { setNotice("Seleziona e copia il link dal campo."); } }}><Copy size={15} /> Copia link</Button></div>
          <Button asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Aggiungimi agli amici su Studio! ${url}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Condividi su WhatsApp</a></Button>
        </TabsContent>
        <TabsContent value="qr"><div className={styles.profileQr}>{url && <QRCodeSVG value={url} size={240} marginSize={4} level="M" title="Scansiona per aprire il mio profilo Studio" />}</div><p>Inquadra il codice con la fotocamera e apri il link per aggiungermi agli amici.</p></TabsContent>
        <p role="status">{notice}</p>
      </Tabs>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
