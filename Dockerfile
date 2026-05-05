# Node version select karein
FROM node:18

# Working directory set karein
WORKDIR /app

# Dependencies copy aur install karein
COPY package*.json ./
RUN npm install

# Baaki saara code copy karein
COPY . .

# Port expose karein (jo aapne env mein 5000 rakha hai)
EXPOSE 5000

# App start karein
CMD ["npm", "start"]