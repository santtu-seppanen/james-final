#!/bin/sh
cd /home/pi/react-native-james;
git fetch;
LOCAL=$(git rev-parse HEAD);
REMOTE=$(git rev-parse @{u});

#if our local revision id doesn't match the remote, we will need to pull the changes
if [ $LOCAL != $REMOTE ]; then
    echo "Publishing our React App";
    #pull and merge changes
    git reset --hard HEAD
    git pull origin master;
    npm install;
    npm run-script build;
    sudo rm -rf /var/www/html/*
    sudo cp -r /home/pi/react-native-james/build/* /var/www/html;
else
    echo "No changes from upstream";
fi
