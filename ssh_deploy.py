import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting to 194.163.155.52...")
client.connect('194.163.155.52', username='root', password='jbJqD77NzehoK1o608JptzR')
print("Connected. Running server-deploy.sh...")
stdin, stdout, stderr = client.exec_command('cd /opt/weaver && bash deploy/server-deploy.sh')

# Print line by line
for line in stdout:
    print(line.strip())
for line in stderr:
    print("ERROR: " + line.strip(), file=sys.stderr)

client.close()
print("Deployment script finished.")
