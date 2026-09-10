# INDIAN RAILWAYS PASSENGER RESERVATION ENQUIRY 🚆

[![Firebase Hosting](https://img.shields.io/badge/Frontend-Firebase%20Hosting-FFCA28?logo=firebase&logoColor=black)](https://ats-universal-ai.web.app)
[![Render Backend](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=white)](https://indian-railways-enquiry-backend.onrender.com)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github&logoColor=white)](https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry)

### 🌐 Live Links
- **Frontend (Firebase Hosting)**: [https://ats-universal-ai.web.app](https://ats-universal-ai.web.app) (Mirror: [https://ats-universal-ai.firebaseapp.com](https://ats-universal-ai.firebaseapp.com))
- **Backend (Render Web Service)**: [https://indian-railways-enquiry-backend.onrender.com](https://indian-railways-enquiry-backend.onrender.com)
- **1-Click Render Deploy**: [Deploy to Render](https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry)
- **GitHub Repository**: [https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry](https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry)

A modern, high-performance web application cloning the official **Indian Railways Passenger Reservation Enquiry** system with real-time train tracking, multi-language support (13 Indian languages), NTES live running status, dynamic seat availability, telescopic fare calculation engine, and an AI chatbot (AskDISHA / RailAI).

---

## 🌟 Key Features

1. **Real-Time Live Train Running Status (GPS / NTES)**
   - Tracks authentic live train location, departure delays, upcoming halts, platform numbers, and distance milestones.
   - Interactive visual route timeline with animated status beacons and delay indicators.

2. **Full Multi-Language Support (13 Indian Languages)**
   - English, Hindi (हिंदी), Bengali (বাংলা), Telugu (తెలుగు), Marathi (मराठी), Tamil (தமிழ்), Gujarati (ગુજરાતી), Kannada (ಕನ್ನಡ), Malayalam (മലയാളം), Punjabi (ਪੰਜਾਬੀ), Odia (ଓଡ଼ିଆ), Assamese (অসমীয়া), and Urdu (اردو) with RTL support.
   - LocalStorage persistence across sessions.

3. **Passenger Name Record (PNR) Enquiry**
   - Instant 10-digit PNR status lookup with chart status, coach, berth number, quota, and confirmation probability.

4. **Live Seat Vacancy & Telescopic Fare Engine**
   - 7-day seat availability matrix with confirmed probability calculations.
   - Dynamic per-kilometer base fare slabs, superfast surcharges, premier train multipliers (Rajdhani/Shatabdi/Vande Bharat), catering options, and 5% GST calculation.

5. **Train Search & Intermediate Schedules**
   - Search across 2,800+ real routes and 3,600+ railway stations across India.
   - Complete route stoppage timetable with platform numbers and halt durations.

6. **Self-Healing AI Travel Assistant (AskDISHA / RailAI)**
   - Powered by Llama 3 via Groq API with streaming responses.
   - Resilient client-side lazy fallback responder ensuring 100% uptime even when offline.

---

## 🏗️ Architecture & Deployment

### 1. Frontend (Firebase Hosting)
- **Tech Stack**: Vanilla HTML5, Modern CSS3 (Glassmorphic theme), JavaScript (ES6+), Google Material Icons.
- **Config**: `firebase.json`
- **Deploy**:
  ```bash
  firebase deploy --only hosting
  ```

### 2. Backend (Render Web Service)
- **Tech Stack**: FastAPI, Uvicorn, Python 3.12, MultiFeatures NTES Engine.
- **Config**: `render.yaml`, `Procfile`, `requirements.txt`
- **CORS**: Configured to accept requests from Firebase Hosting domains and localhost.

---

## 🚀 Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry.git
   cd Indian-Railways-Passenger-Reservation-Enquiry
   ```

2. Create virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Run the development server:
   ```bash
   python app.py
   ```
   Open your browser at `http://localhost:7860/`.

---

## 📄 License
MIT License
