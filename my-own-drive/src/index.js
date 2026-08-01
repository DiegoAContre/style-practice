import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { supabase } from './lib/supabaseClient';

// ponytail: one-time connection check on boot, remove when wiring real auth
supabase
  .from('profiles')
  .select('id', { count: 'exact', head: true })
  .then(({ count, error }) => {
    if (error) console.error('[supabase] connection failed:', error.message);
    else console.log('[supabase] connected OK — profiles count:', count);
  });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
