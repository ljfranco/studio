# Gemini Code Assistant Project Overview

This document provides a comprehensive overview of the Next.js project, designed to assist the Gemini Code Assistant in understanding the project's structure, technologies, and operational scripts.

## Project Description

This is a full-stack web application built with Next.js and TypeScript. It utilizes Firebase for backend services, including authentication and database functionalities. The application features a comprehensive user interface built with Radix UI and custom components, styled with Tailwind CSS. It also integrates AI capabilities using Google's Genkit. The project is structured to support user and admin roles, with features for managing inventory, sales, and user accounts.

## Key Technologies

- **Framework**: [Next.js](https://nextjs.org/) (^15.3.3)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (^5)
- **Backend as a Service (BaaS)**: [Firebase](https://firebase.google.com/) (^11.3.0)
- **AI Integration**: [Google AI Genkit](https://firebase.google.com/docs/genkit) (^1.0.4)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (^3.4.1)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) and custom components located in `src/components/ui`.
- **State Management**: [React Query](https://tanstack.com/query/v5) (^5.66.0) for server-state management.
- **Form Handling**: [React Hook Form](https://react-hook-form.com/) (^7.54.2) with [Zod](https://zod.dev/) (^3.24.2) for validation.
- **Service Worker**: [@serwist/next](https://serwist.pages.dev/docs/next/introduction) for PWA capabilities.

## Project Structure

The project follows a standard Next.js `src` directory structure:

- **`src/app/`**: Contains the application's routes and pages, following the Next.js App Router convention.
  - **`src/app/admin/`**: Admin-only pages for managing users, inventory, and transactions.
  - **`src/app/api/`**: API routes for handling server-side logic, such as sending notifications.
  - **`src/app/profile/`**: User profile page.
- **`src/components/`**: Reusable React components, organized by feature (admin, auth, dashboard, etc.) and a `ui` sub-directory for generic components.
- **`src/context/`**: React context providers for authentication (`AuthContext.tsx`) and Firebase (`FirebaseContext.tsx`).
- **`src/hooks/`**: Custom React hooks for shared logic.
- **`src/lib/`**: Core functionalities, Firebase configuration, and utility functions.
  - **`src/lib/firebase.ts`**: Firebase client-side initialization.
  - **`src/lib/firebase-admin.ts`**: Firebase admin SDK initialization (for server-side use).
- **`src/ai/`**: Contains the Genkit AI flow definitions.
- **`public/`**: Static assets like images, icons, and the web app manifest.

## Available Scripts

The `package.json` file defines the following scripts for development and maintenance:

- **`npm run dev`**: Starts the Next.js development server on port 9002.
- **`npm run genkit:dev`**: Starts the Genkit development server to test AI flows locally.
- **`npm run genkit:watch`**: Starts the Genkit server in watch mode, automatically restarting on file changes.
- **`npm run build`**: Creates a production-ready build of the Next.js application.
- **`npm run start`**: Starts the production server for the built application.
- **`npm run lint`**: Runs the Next.js linter (`next lint`) to identify and fix code style issues.
- **`npm run typecheck`**: Runs the TypeScript compiler (`tsc --noEmit`) to check for type errors in the codebase.

## How to Get Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run the Development Server**:
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

3.  **Run the Genkit AI Server (in a separate terminal)**:
    ```bash
    npm run genkit:dev
    ```
    The Genkit UI will be available at `http://localhost:4000`.
