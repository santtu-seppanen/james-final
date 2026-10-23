import React from 'react';
import {View, Text, StyleSheet} from 'react-native-web';
import Modal from 'modal-react-native-web';

const InfoModal = ({visible, message}) => {
  return (
    <View style={styles.centeredView}>
      <Modal
        animationType="slide"
        transparent={true}
        visible={visible}
        ariaHideApp={false}>
        <View style={styles.modalView}>
          <View>
            <Text style={styles.modalText}>{message}</Text>
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
});

export default InfoModal;
