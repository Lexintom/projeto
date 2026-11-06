#!/bin/bash
set -euo pipefail

# Este hook só roda depois que o LocalStack está pronto.
for queue in wager-transactions.fifo wager-transactions-dlq.fifo wager-events.fifo; do
  awslocal sqs create-queue --queue-name "$queue" \
    --attributes '{"FifoQueue":"true","ContentBasedDeduplication":"false","VisibilityTimeout":"60","ReceiveMessageWaitTimeSeconds":"20"}'
done

main_url=$(awslocal sqs get-queue-url --queue-name wager-transactions.fifo --query QueueUrl --output text)
dlq_url=$(awslocal sqs get-queue-url --queue-name wager-transactions-dlq.fifo --query QueueUrl --output text)
dlq_arn=$(awslocal sqs get-queue-attributes --queue-url "$dlq_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)
attributes=$(python3 - "$dlq_arn" <<'PY'
import json, sys
print(json.dumps({"RedrivePolicy": json.dumps({"deadLetterTargetArn":sys.argv[1],"maxReceiveCount":"5"})}))
PY
)
awslocal sqs set-queue-attributes --queue-url "$main_url" --attributes "$attributes"
echo "Filas prontas."
