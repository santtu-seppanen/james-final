import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableHighlight,
  TextInput,
  View,
  SafeAreaView,
  Picker,
  TouchableOpacity,
  Image,
} from 'react-native';
import InfoModal from './infoModal';

export default class BottleConfig extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      errors: [],
      hasNewBottles: false,
      submitted: false,
      bottle: this.props.route.params.bottle
        ? this.props.route.params.bottle
        : {},
      modalMessage: '',
      modalVisible: false,
      bottlesPicker: [],
      capacities: [
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
        '1000',
      ],
      servings: ['25', '50'],
    };

    this.getAvailableBottles();
  }

  componentWillReceiveProps(props) {
    this.setState({bottle: this.props.route.params.bottle});
  }

  getAvailableBottles() {
    fetch('http://localhost:8000/getAvailableBottles')
      .then((response) => response.json())
      .then((body) => {
        this.setState({bottlesPicker: JSON.parse(body)});
      });

    this.setState({
      errors: [],
      submitted: false,
    });
  }

  setAvailableBottles() {
    this.state.bottlesPicker.push(this.state.bottle.name);

    fetch('http://localhost:8000/setAvailableBottles', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.state.bottlesPicker),
    })
      .then((response) => response.json())
      .then((body) => {
        this.setState({bottlesPicker: JSON.parse(body)});
      });
  }

  setBottlesToJames() {
    if (this.state.hasNewBottles) {
      this.setState({
        hasNewBottles: false,
      });
      this.setAvailableBottles();
    }

    const validationErrors = this.validateInputs(this.state.bottle);
    const bottles = this.props.route.params.bottles;
    const index = this.props.route.params.index;
    bottles[index] = this.state.bottle;
    if (validationErrors.length === 0) {
      fetch('http://localhost:8000/setBottles', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bottles),
      })
        .then((response) => response.json())
        .then((body) => {
          this.setState({bottles: JSON.parse(body)});
          this.toggleModal('bottles updated');
        });

      this.setState({
        errors: [],
        submitted: false,
      });
    } else {
      this.setState({
        submitted: true,
      });
      console.log(validationErrors);
    }
  }

  toggleModal = (message) => {
    this.setState({
      modalMessage: message,
      modalVisible: true,
    });

    setTimeout(() => {
      this.setState({
        modalMessage: '',
        modalVisible: false,
      });
      this.props.navigation.goBack();
    }, 2000);
  };

  onChangeText = (bottle, text) => {
    bottle.name = text;
    this.setState(this.state.bottle);
  };

  onNewText = (bottle, text) => {
    bottle.name = text;

    if (this.state.bottlesPicker.some((bottleName) => bottleName === text)) {
      this.setState({
        hasNewBottles: false,
      });
    } else {
      this.setState({
        hasNewBottles: true,
      });
    }
  };

  onChangeCapacity = (bottle, text) => {
    bottle.capacity = text;
    bottle.originalCapacity = text;
    this.setState(this.state.bottle);
  };

  onChangeServing = (bottle, text) => {
    bottle.serving = text;
    this.setState(this.state.bottle);
  };

  validateInputs = (bottle) => {
    let errors = [];

    if (isNaN(bottle.serving)) {
      errors.push(`${bottle.name} serving is not a number`);
    } else if (+bottle.serving !== 25 && +bottle.serving !== 50) {
      errors.push(`${bottle.name} serving can only be 25 or 50ml`);
    }

    if (isNaN(bottle.capacity)) {
      errors.push(`${bottle.name} capacity is not a number`);
    }

    this.setState({
      errors: errors,
    });

    return errors;
  };

  render() {
    let bottle = this.state.bottle;
    return (
      <SafeAreaView
        style={{
          flex: 1,
        }}>
        <View style={{padding: 20}}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bottle name</Text>
            {this.state.newBottle ? (
              <View style={{borderWidth: 1}}>
                <TextInput
                  style={{height: 48, width: 148, backgroundColor: '#fff'}}
                  onChangeText={(text) => {
                    console.log(text);
                    this.onNewText(bottle, text);
                  }}></TextInput>
              </View>
            ) : (
              <Picker
                selectedValue={bottle.name}
                style={{height: 50, width: 150}}
                onValueChange={(itemValue, itemIndex) => {
                  console.log(itemValue);
                  this.onChangeText(bottle, itemValue);
                }}>
                {this.state.bottlesPicker.map((bottle) => {
                  return <Picker.Item label={bottle} value={bottle} />;
                })}
              </Picker>
            )}
            <TouchableOpacity
              style={{
                paddingLeft: 10,
              }}
              onPress={() => this.setState({newBottle: !this.state.newBottle})}>
              <Image
                source={require('./icons/plus.png')}
                style={{
                  height: 20,
                  width: 20,
                }}></Image>
            </TouchableOpacity>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bottle capacity (ml)</Text>
            <Picker
              selectedValue={bottle.capacity}
              style={{height: 50, width: 150, marginRight: 25}}
              onValueChange={(itemValue, itemIndex) => {
                console.log(itemValue);
                this.onChangeCapacity(bottle, itemValue);
              }}>
              {this.state.capacities.map((capacity) => {
                return <Picker.Item label={capacity + 'ml'} value={capacity} />;
              })}
            </Picker>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>One time pour (ml)</Text>
            <Picker
              selectedValue={bottle.serving}
              style={{height: 50, width: 150, marginRight: 25}}
              onValueChange={(itemValue, itemIndex) => {
                this.onChangeServing(bottle, itemValue);
              }}>
              {this.state.servings.map((serving) => {
                return <Picker.Item label={serving + 'ml'} value={serving} />;
              })}
            </Picker>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            marginTop: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableHighlight
            onPress={(event) => this.setBottlesToJames()}
            style={styles.button}
            underlayColor={'#0A84D0'}>
            <Text style={styles.buttonText}>Update</Text>
          </TouchableHighlight>
          <TouchableHighlight
            onPress={(event) => this.props.navigation.goBack()}
            style={styles.button}
            underlayColor={'#0A84D0'}>
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableHighlight>
        </View>
        <InfoModal
          visible={this.state.modalVisible}
          message={this.state.modalMessage}
        />
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  inputContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  label: {
    width: 200,
    fontWeight: 'bold',
  },
  inputText: {
    height: 40,
    width: 200,
    borderColor: 'gray',
    borderWidth: 1,
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
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
