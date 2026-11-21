# Moader Catalog

Players browse community-made mods on the web and install matching packages through Moader on their Switch. Creators sign up, prepare private drafts, publish versioned packages and manage their public listings.

## Platform

The public website works in desktop and mobile browsers. The console uses the catalog feed and same-origin file links. It shares Moader’s wordmark, fonts, ink background, mint focus treatment and artwork-led browsing with the native app and paired web GUI.

## Stack

The Cloudflare Worker handles the website, catalog, sessions and publishing API. D1 stores listings and release metadata. Supabase Auth holds creator passwords and private Supabase Storage holds downloadable bytes.
