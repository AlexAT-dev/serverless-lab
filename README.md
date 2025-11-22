serverless offline

docker create --name dynamodb -p 8000:8000 amazon/dynamodb-local
docker run -p 8000:8000 amazon/dynamodb-local

docker start dynamodb
docker stop dynamodb

node createTables.js

serverless deploy
