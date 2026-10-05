import { Suspense } from "react";
import { PinForm } from "./PinForm";
import "./login.css";

export const metadata = { title: "Accesso · Second Brain" };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-brand">
          <span className="logo">SB</span>
          <div>
            <b>Second Brain</b>
            <small>ACCESSO RISERVATO</small>
          </div>
        </div>
        <h3>Inserisci il PIN</h3>
        <Suspense>
          <PinForm />
        </Suspense>
        <div className="login-foot">daro-hub/second-brain · sessione 30 giorni</div>
      </div>
    </div>
  );
}
