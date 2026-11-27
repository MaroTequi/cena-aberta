FROM postgres:16-alpine
RUN apk add --no-cache python3 && mkdir /archive && chown postgres:postgres /archive
COPY backup_service.py /opt/backup_service.py
USER postgres
ENTRYPOINT ["python3","/opt/backup_service.py"]
