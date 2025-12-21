# Vercel Deployment Guide

## Prerequisites
1. Vercel account
2. MongoDB Atlas connection string
3. All environment variables configured

## Environment Variables to Set in Vercel

Go to your Vercel project settings → Environment Variables and add:

1. **DB_USER** - Your MongoDB username
2. **DB_PASS** - Your MongoDB password
3. **JWT_SECRET** - Your JWT secret key
4. **STRIPE_SECRET_KEY** - Your Stripe secret key
5. **CLIENT_URL** - Your frontend URL (e.g., https://your-frontend.vercel.app)

## Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from backend directory**:
   ```bash
   cd backend
   vercel
   ```

4. **For production deployment**:
   ```bash
   vercel --prod
   ```

## Important Notes

- The backend is now configured as a serverless function
- MongoDB connection is optimized for serverless (connection pooling)
- All API routes are accessible at: `https://your-project.vercel.app/api/*`
- Health check endpoint: `https://your-project.vercel.app/health`

## Testing the Deployment

After deployment, test your API:
```bash
curl https://your-project.vercel.app/health
```

You should get: `{"status":"OK","timestamp":"..."}`

## Troubleshooting

1. **If APIs return 404**:**
   - Check that `vercel.json` is in the backend root
   - Verify the build completed successfully

2. **If MongoDB connection fails:**
   - Verify environment variables are set correctly in Vercel
   - Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for Vercel)

3. **If CORS errors:**
   - Update `CLIENT_URL` environment variable in Vercel
   - Check that your frontend URL is in the CORS origins list


