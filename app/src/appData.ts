/**
 * The bundled dataset (`preclear-data.json`) and the labels built on top of it.
 *
 * Split out of App.tsx so every screen file can import the same typed `data`
 * without re-deriving it, and so the payer label maps live in exactly one place.
 */

import raw from '../assets/preclear-data.json';
import { FacilityBundle, Requirement } from './routes';

export type Indication = { key: string; label: string };
export type Procedure = {
  cpt: string;
  label: string;
  detail: string;
  indications: Indication[];
  payers: Record<string, FacilityBundle[]>;
};
export type Bundle = {
  metro: string;
  // Written by pipeline/export_app_data.py and, until the sources screen,
  // declared nowhere — so the provenance shipped inside the bundle and no
  // screen could read it. Shown verbatim rather than restated, so the claim on
  // screen changes when the pipeline's does.
  generated_from: string;
  disclosure: string;
  procedures: Procedure[];
  requirements: Requirement[];
};

export const data = raw as unknown as Bundle;

export const PAYER_LABELS: Record<string, string> = {
  anthem: 'Anthem Blue Cross Blue Shield',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

/**
 * What the chip says, where the full name will not fit on one line.
 *
 * Four full payer names run to roughly 420pt across a 345pt column, so the row
 * wrapped. These are the brand's own short forms, and the full name still goes
 * to the screen reader through `accessibilityLabel` — nothing is lost, and a
 * shortened brand name cannot be misread the way a shortened clinical phrase
 * could.
 */
export const PAYER_CHIP_LABELS: Record<string, string> = {
  anthem: 'Anthem',
  unitedhealthcare: 'United',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

export const STEPS = ['Scan', 'Coverage', 'Routes'] as const;
