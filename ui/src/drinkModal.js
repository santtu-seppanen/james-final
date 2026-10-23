import React from 'react';
import {View, Text, TouchableHighlight, StyleSheet} from 'react-native';
import Modal from 'modal-react-native-web';

const DrinkModal = ({onAcceptClick, onCancelClick, message, visible}) => {
  return (
    <View style={styles.centeredView}>
      <Modal animationType="slide" transparent={true} visible={visible}>
        <View style={styles.modalView}>
          <View>
            <Text style={styles.modalText}>{message}</Text>
            <View style={styles.buttonContainer}>
              <TouchableHighlight
                onPress={onAcceptClick}
                style={styles.button}
                underlayColor={'#0A84D0'}>
                <View>
                  <Text style={styles.buttonText}>Ei haittaa</Text>
                </View>
              </TouchableHighlight>
              <TouchableHighlight
                onPress={onCancelClick}
                style={styles.button}
                underlayColor={'#0A84D0'}>
                <View>
                  <Text style={styles.buttonText}>Sulje</Text>
                </View>
              </TouchableHighlight>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalText: {
    fontWeight: 'bold',
    color: '#1B95E0',
    textAlign: 'center',
    padding: 10,
  },
  button: {
    borderRadius: 3,
    padding: 20,
    marginVertical: 10,
    marginTop: 10,
    marginLeft: 10,
    backgroundColor: '#1B95E0',
    height: 60,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default DrinkModal;
