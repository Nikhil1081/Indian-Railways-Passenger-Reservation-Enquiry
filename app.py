import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    print(f"Starting Indian Railways Passenger Enquiry system on port {port}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
