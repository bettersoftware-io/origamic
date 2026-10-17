interface ImportMetaEnv {
  /** Where Supabase answers. Unset or empty: every port on its simulator. */
  readonly VITE_SUPABASE_URL?: string;
  /** The key the browser signs its requests to Supabase with. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Where the gateway answers. Unset or empty: the model is scripted (src/app/devScript.ts). */
  readonly VITE_GATEWAY_URL?: string;
}
