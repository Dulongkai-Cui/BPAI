FROM nginx:1.27-alpine

COPY Front/site/ /usr/share/nginx/html/
RUN cp /usr/share/nginx/html/dashboard.html /usr/share/nginx/html/index.html
EXPOSE 80
