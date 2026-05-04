FROM node:18-slim

# تثبيت التبعات اللازمة للنظام
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نسخ ملفات التبعات وتثبيتها
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

# نسخ باقي ملفات المشروع
COPY . .

# تشغيل البوت
CMD ["node", "index.js"]
