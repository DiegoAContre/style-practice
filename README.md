<div align="center">

# style-practice

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3fcf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ed?style=flat-square&logo=docker&logoColor=white)

[Projects](#projects) • [moviedb](#moviedb) • [my-own-drive](#my-own-drive)

</div>

A collection of self-contained frontend projects for practicing and applying CSS and UI skills. Each project lives in its own folder with its own dependencies, tooling and Docker setup — pick one and run it.

## Projects

| | Project | Description | Stack |
| --- |:--- | --- | --- |
| <img src="./moviedb/public/favicon.svg" width="32px"/> | [moviedb](./moviedb) | Search any movie or show and find where to stream it | React · Vite · Vitest |
| <img src="./my-own-drive/public/logo192.png" width="32px"/> | [my-own-drive](./my-own-drive) | Personal cloud storage, Google Drive–like | React · Supabase |

## Prerequisites

- [Node.js](https://nodejs.org/en/download) 20+ (22+ for `my-own-drive`)
- [Docker](https://www.docker.com/get-started/) _(optional, for containerized dev)_

## moviedb

Movie search app powered by the *Where Can I Watch* API (via [RapidAPI](https://rapidapi.com/)). Built with React 19, Vite and React Router 7.

- Search movies and shows by title and see on which streaming services they're available
- Detail pages for each result
- Favorites list persisted in `localStorage`
- Component tests with Vitest and Testing Library

## my-own-drive

Personal cloud storage app. React 19 (Create React App) frontend with [Supabase](https://supabase.com/) for authentication, database and file storage.

- Email/password authentication with protected routes
- File upload and browsing with folder navigation
- User profiles with unique usernames