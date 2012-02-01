#!/usr/bin/env bash



#----------------------------------------------------------
# Settings
#----------------------------------------------------------
if [ "$NAUTO_USER" = '' ]; then echo "Assigning NAUTO_USER=nauto"; NAUTO_USER=nauto; fi;
if [ "$NAUTO_GROUP" = '' ]; then echo "Assigning NAUTO_GROUP=nogroup"; NAUTO_GROUP=GLGDEV\domain^admins; fi;
if [ "$NAUTO_DIR" = '' ]; then echo "Assigning NAUTO_DIR=/var/nauto"; NAUTO_DIR=/var/$NAUTO_USER; fi;

    
#----------------------------------------------------------
# Dependencies
#----------------------------------------------------------

echo -e "\nInstalling Dependencies ...."
echo ------------------------------------------------------
apt-get update -y
apt-get install make libssl-dev build-essential curl git-core -y

# create application account if needed
echo -e "\nSetting up accounts ...."
echo ------------------------------------------------------
echo "adduser --system --home $NAUTO_DIR $NAUTO_USER"
adduser --system --home $NAUTO_DIR $NAUTO_USER
chown $NAUTO_USER:$NAUTO_GROUP $NAUTO_DIR
chmod 777 $NAUTO_DIR

echo ------------------------------------------------------
echo -e "\nDone!"



