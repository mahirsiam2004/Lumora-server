# Lumora Backend API

A robust Node.js/Express backend API for the Lumora decoration services platform, featuring user authentication, service management, booking system, and Stripe payment integration.

##  Features

- **User Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (Admin, Decorator, User)
  - Firebase integration for user management

- **Service Management**
  - CRUD operations for decoration services
  - Service categories and filtering
  - Search functionality with MongoDB text search

- **Booking System**
  - Create and manage bookings
  - Booking status tracking
  - Decorator assignment
  - User and decorator dashboards

- **Payment Integration**
  - Stripe Checkout Sessions
  - Payment verification
  - Webhook support for reliable payment processing
  - Payment history tracking

- **Analytics Dashboard**
  - Revenue tracking
  - Booking statistics
  - Service demand analytics
  - Monthly revenue reports

- **Reviews & Ratings**
  - Service reviews
  - Review management

##  Tech Stack

- **Runtime**: Node.js (>=18.x)
- **Framework**: Express.js
- **Database**: MongoDB (MongoDB Atlas)
- **Authentication**: JWT (JSON Web Tokens)
- **Payment**: Stripe API
- **Deployment**: Vercel Serverless Functions

##  Prerequisites

- Node.js >= 18.x
- npm or yarn
- MongoDB Atlas account (or local MongoDB instance)
- Stripe account (for payment processing)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   
   # MongoDB Configuration
   DB_USER=your_mongodb_username
   DB_PASS=your_mongodb_password
   
   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   
   # Stripe Configuration
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   
   # Client URL (Frontend)
   CLIENT_URL=http://localhost:5173
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:5000`

## 📁 Project Structure

```
backend/
├── index.js              # Main server file with all routes
├── package.json          # Dependencies and scripts
├── vercel.json           # Vercel deployment configuration
├── .env                  # Environment variables (not committed)
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## 🔌 API Endpoints

### Authentication
- `POST /api/jwt` - Generate JWT token
- `POST /api/users` - Create new user

### Users
- `GET /api/users/:email` - Get user by email (Protected)
- `GET /api/users` - Get all users (Admin only)
- `PATCH /api/users/:id/role` - Update user role (Admin only)

### Decorators
- `GET /api/decorators` - Get all approved decorators
- `PATCH /api/decorators/:email` - Update decorator profile (Protected)

### Services
- `GET /api/services` - Get all services (with filtering, pagination, search)
- `GET /api/services/:id` - Get service by ID
- `POST /api/services` - Create service (Admin only)
- `PATCH /api/services/:id` - Update service (Admin only)
- `DELETE /api/services/:id` - Delete service (Admin only)
- `GET /api/service-categories` - Get all service categories

### Bookings
- `POST /api/bookings` - Create booking (Protected)
- `GET /api/bookings/user/:email` - Get user bookings (Protected)
- `GET /api/bookings/decorator/:email` - Get decorator bookings (Protected)
- `GET /api/bookings` - Get all bookings (Admin only)
- `GET /api/bookings/:id` - Get single booking (Protected)
- `PATCH /api/bookings/:id` - Update booking (Protected)
- `PATCH /api/bookings/:id/assign` - Assign decorator (Admin only)
- `PATCH /api/bookings/:id/status` - Update booking status (Decorator/Admin)
- `DELETE /api/bookings/:id` - Cancel booking (Protected)

### Payments
- `POST /api/create-payment-intent` - Create Stripe payment intent (Protected)
- `POST /api/create-checkout-session` - Create Stripe checkout session (Protected)
- `POST /api/verify-payment` - Verify payment after checkout (Protected)
- `POST /api/webhook/stripe` - Stripe webhook endpoint (No auth required)
- `POST /api/payments` - Save payment record (Protected)
- `GET /api/payments/user/:email` - Get user payments (Protected)
- `GET /api/payments/decorator/:email` - Get decorator earnings (Protected)
- `GET /api/payments` - Get all payments (Admin only)

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard analytics (Admin only)

### Reviews
- `POST /api/reviews` - Create review (Protected)
- `GET /api/reviews/service/:serviceId` - Get service reviews

### Health Check
- `GET /health` - Server health check
- `GET /` - Root endpoint

## 🔐 Authentication

Most endpoints require authentication via JWT token. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### User Roles

- **user**: Regular customer
- **decorator**: Service provider
- **admin**: Platform administrator

## 💳 Stripe Integration

### Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Add `STRIPE_SECRET_KEY` to your `.env` file
4. Set up webhook endpoint in Stripe Dashboard:
   - URL: `https://your-backend.vercel.app/api/webhook/stripe`
   - Events: `checkout.session.completed`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### Payment Flow

1. Client creates checkout session via `/api/create-checkout-session`
2. User completes payment on Stripe
3. Stripe redirects to success page
4. Client verifies payment via `/api/verify-payment`
5. Webhook also processes payment server-side for reliability

## 🚀 Deployment

### Vercel Deployment

1. **Install Vercel CLI** (optional)
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from your `.env` file
   - Make sure to use production Stripe keys

4. **Configure Webhook**
   - Update Stripe webhook URL to your Vercel deployment URL
   - Update `CLIENT_URL` to your frontend production URL

### Environment Variables for Production

```env
PORT=5000
DB_USER=your_production_db_user
DB_PASS=your_production_db_password
JWT_SECRET=your_production_jwt_secret
STRIPE_SECRET_KEY=sk_live_your_production_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
CLIENT_URL=https://your-frontend-domain.vercel.app
```

## 🧪 Testing

### Health Check
```bash
curl http://localhost:5000/health
```

### Test Authentication
```bash
# Generate JWT token
curl -X POST http://localhost:5000/api/jwt \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## 📝 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

## 🔒 Security Features

- JWT token authentication
- Role-based access control
- CORS configuration
- Environment variable protection
- Stripe webhook signature verification
- MongoDB injection prevention (using ObjectId)

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Verify `DB_USER` and `DB_PASS` are correct
- Check MongoDB Atlas IP whitelist
- Ensure network access is enabled

### Stripe Webhook Issues
- Verify webhook secret matches Stripe Dashboard
- Check webhook endpoint URL is correct
- Ensure webhook events are configured

### 404 Errors on Vercel
- Verify `vercel.json` routes are configured correctly
- Check that routes are registered synchronously (not in async functions)
- Ensure all environment variables are set

## 📄 License

This project is proprietary and confidential.

## 👥 Support

For issues and questions, please contact the development team.

---

**Built with efforts for Lumora**

