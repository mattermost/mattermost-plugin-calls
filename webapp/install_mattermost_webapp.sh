readonly COMMITHASH=79b1e9d20081504a6caf57cdb9e9cb4a8d0552f5

echo "\n\nInstalling mattermost-webapp from the mattermost repo, using commit hash $COMMITHASH\n"

if [ ! -d mattermost-webapp ]; then
  mkdir mattermost-webapp
fi

cd mattermost-webapp

if [ ! -d .git ]; then
  git init
  git config --local uploadpack.allowReachableSHA1InWant true
  git remote add origin https://github.com/mattermost/mattermost.git
fi

git fetch --depth=1 origin $COMMITHASH
git reset --hard FETCH_HEAD

cd ..
npm i --save-dev ./mattermost-webapp/webapp/channels
npm i --save-dev ./mattermost-webapp/webapp/platform/types
npm i --save-dev ./mattermost-webapp/webapp/platform/client
cd ../standalone
npm i --save-dev ../webapp/mattermost-webapp/webapp/platform/types
npm i --save-dev ../webapp/mattermost-webapp/webapp/platform/client
