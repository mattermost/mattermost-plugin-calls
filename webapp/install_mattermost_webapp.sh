readonly COMMITHASH=8235b5bb44

echo "\n\nInstalling mattermost-webapp from the mattermost repo, using commit hash $COMMITHASH\n"
mkdir mattermost-webapp
cd mattermost-webapp
git init
git remote add -f origin https://github.com/mattermost/mattermost.git
git config core.sparseCheckout true
echo "webapp/channels\nwebapp/platform/types\nwebapp/platform/client" >> .git/info/sparse-checkout
git pull --depth=1 origin master
git checkout $COMMITHASH
cd ..
npm i --save-dev ./mattermost-webapp/webapp/channels
npm i --save-dev ./mattermost-webapp/webapp/platform/types
npm i --save-dev ./mattermost-webapp/webapp/platform/client
cd ../standalone
npm i --save-dev ../webapp/mattermost-webapp/webapp/platform/types
npm i --save-dev ../webapp/mattermost-webapp/webapp/platform/client
