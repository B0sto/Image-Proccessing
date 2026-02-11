# Image Processing Studio

Full-stack image processing app with:
- JWT-based authentication
- Image upload to AWS S3
- On-demand preview transforms
- Persistent transformed variants
- User-scoped image library with pagination

The project is split into:
- `client/` - Next.js 16 + React 19 frontend
- `server/` - NestJS 11 API + MongoDB + Sharp + S3

## Features

- User registration and login
- Bearer-token protected API routes
- Upload via multipart (`POST /images`)
- Optional direct-to-S3 upload flow (presigned URL + finalize)
- Transformations:
  - resize (with fit mode)
  - crop
  - rotate
  - flip / mirror
  - grayscale / sepia
  - compression quality
  - output format (`jpeg`, `jpg`, `png`, `webp`, `avif`)
  - text watermark (position, font size, opacity)
- Variant deduplication by transformation hash
- Transform endpoint rate limit per user+image

## Architecture

- Frontend stores `accessToken` in `localStorage`
- Frontend sends `Authorization: Bearer <token>` for protected calls
- API validates token in `AuthGuard`
- Original and variant binaries are stored in S3
- Image metadata and variant history are stored in MongoDB (`image` collection)

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- MongoDB instance (Atlas/local)
- AWS S3 bucket and credentials with object read/write/delete permissions

## Environment Variables

### Server (`server/.env`)

```dotenv
MONGO_URI=
JWT_SECRET=

AWS_ACCESS_KEY=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=
AWS_REGION=

# Optional
PORT=3001
CLIENT_URL=http://localhost:3000
TRANSFORM_RATE_LIMIT_WINDOW_MS=60000
TRANSFORM_RATE_LIMIT_MAX=20
```

### Client (`client/.env.local`)

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Local Setup

Install dependencies:

```bash
cd server
npm install

cd ../client
npm install
```

Run backend (port `3001` by default):

```bash
cd server
npm run start:dev
```

Run frontend (port `3000`):

```bash
cd client
npm run dev
```

Open `http://localhost:3000`.

## Main API Endpoints

Auth:
- `POST /register`
- `POST /login`
- `GET /auth/current-user` (protected)
- Legacy aliases: `POST /auth/sign-up`, `POST /auth/sign-in`

Images (all protected):
- `POST /images` (multipart field: `file`)
- `POST /images/upload-url`
- `POST /images/finalize-upload`
- `GET /images?page=1&limit=10`
- `GET /images/:id`
- `GET /images/:id?variant=<hash>`
- `GET /images/:id?format=webp`
- `POST /images/:id/transform` (returns binary preview)
- `POST /images/:id/transform/save` (stores variant in S3 + DB)
- `DELETE /images/:id`

## Transformation Request Shape

Example payload for `POST /images/:id/transform` or `POST /images/:id/transform/save`:

```json
{
  "transformations": {
    "resize": { "width": 1280, "height": 720, "fit": "cover" },
    "crop": { "width": 800, "height": 600, "x": 10, "y": 20 },
    "rotate": 90,
    "flip": true,
    "mirror": false,
    "compress": { "quality": 80 },
    "format": "webp",
    "filters": { "grayscale": false, "sepia": true },
    "watermark": {
      "text": "Sample",
      "position": "southeast",
      "fontSize": 28,
      "opacity": 35
    }
  }
}
```

## Scripts

Server (`server/package.json`):
- `npm run start:dev` - run API in watch mode
- `npm run build` - build API
- `npm run start:prod` - run built API
- `npm run test` - unit tests
- `npm run test:e2e` - e2e tests

Client (`client/package.json`):
- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - lint frontend

## Notes

- Keep secrets in local env files only.
- If credentials were ever committed or shared, rotate them immediately.
- Current transform rate limit state is in-memory, so it resets on server restart and is per-instance.
