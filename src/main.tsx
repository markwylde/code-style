import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'highlight.js/styles/atom-one-light.css'
import './style.css'

const appRoot = document.getElementById('app')

if (!appRoot) {
  throw new Error('Missing #app root element')
}

ReactDOM.createRoot(appRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
