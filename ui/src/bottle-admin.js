import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  Image,
  TouchableOpacity,
} from 'react-native';
import InfoModal from './infoModal';
import {ADMIN_PIN} from './config';

export default class BottleAdmin extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      bottles: [],
      errors: [],
      submitted: false,
      modalMessage: '',
      modalVisible: false,
      authorised: false,
      code: '',
    };
  }

  componentDidMount = () => {
    console.log('Component mounting');
    this.props.navigation.addListener('focus', () => {
      // do something
      this.getBottlesFromJames();
    });
  };

  getBottlesFromJames() {
    fetch('http://localhost:8000/getBottles')
      .then((response) => response.json())
      .then((body) => {
        this.setState({bottles: JSON.parse(body)});
      });

    this.setState({
      errors: [],
      submitted: false,
    });
  }

  toggleModal = (message) => {
    this.setState(
      {
        modalMessage: message,
        modalVisible: true,
      },
      () => console.log(this.state),
    );

    setTimeout(
      () =>
        this.setState({
          modalMessage: '',
          modalVisible: false,
        }),
      2000,
    );
  };

  onChangeText = (bottle, text) => {
    bottle.name = text;
    this.setState(this.state.bottles);
  };

  onChangeCapacity = (bottle, text) => {
    bottle.capacity = text;
    this.setState(this.state.bottles);
  };

  onChangeServing = (bottle, text) => {
    bottle.serving = text;
    this.setState(this.state.bottles);
  };

  validateInputs = (bottles) => {
    console.log(bottles);
    let errors = [];
    bottles.forEach((bottle) => {
      if (isNaN(bottle.serving)) {
        errors.push(`${bottle.name} serving is not a number`);
      } else if (+bottle.serving !== 25 && +bottle.serving !== 50) {
        errors.push(`${bottle.name} serving can only be 25 or 50ml`);
      }

      if (isNaN(bottle.capacity)) {
        errors.push(`${bottle.name} capacity is not a number`);
      }
    });

    this.setState({
      errors: errors,
    });

    return errors;
  };

  checkCode = (digit) => {
    this.setState({code: this.state.code + digit}, () => {
      if (digit === 'back') {
        this.setState({code: ''});
        this.props.navigation.goBack();
      } else if (this.state.code.length > 4) {
        this.setState({code: ''});
        this.toggleModal('Wrong code');
      } else if (this.state.code === ADMIN_PIN) {
        this.setState({authorised: true});
      }
    });
  };

  render() {
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, '#', 'back'];
    return (
      <SafeAreaView
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: 'white',
        }}>
        {this.state.authorised === true && (
          <View style={{flex: 1}}>
            <ScrollView
              style={{
                marginHorizontal: 20,
                height: 200,
              }}
              horizontal="false"
              contentContainerStyle={{
                justifyContent: 'center',
                alignItems: 'center',
              }}>
              {this.state.bottles.map((bottle, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    this.props.navigation.push('SingleBottleConfig', {
                      bottle,
                      bottles: this.state.bottles,
                      index,
                    });
                  }}>
                  <View
                    key={bottle.name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 20,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                    {images[bottle.name] !== undefined ? (
                      <Image
                        source={images[bottle.name]}
                        style={{width: 100, height: 200}}
                        resizeMode="contain"></Image>
                    ) : (
                      <Image
                        source={require('./bottles/bottle.png')}
                        style={{width: 100, height: 200}}
                        resizeMode="contain"></Image>
                    )}
                    <Text style={{marginVertical: 20, fontWeight: 'bold'}}>
                      {bottle.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {this.state.errors.length !== 0 && this.state.submitted && (
                <View>
                  {this.state.errors.map((error) => (
                    <Text style={{color: 'red'}} key={error}>
                      -{error}
                    </Text>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity
              onPress={() => this.props.navigation.goBack()}
              style={[styles.button, {width: 100, alignSelf: 'center'}]}>
              <Text style={styles.buttonText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
        {this.state.authorised === false && (
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: 200,
              paddingVertical: 10,
            }}>
            {buttons.map((button) => (
              <TouchableOpacity
                onPress={() => this.checkCode(button)}
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 50,
                  margin: 15,
                  backgroundColor: 'lightgrey',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}>
                  {button}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {this.state.modalVisible === true && (
          <InfoModal
            visible={this.state.modalVisible}
            message={this.state.modalMessage}
          />
        )}
      </SafeAreaView>
    );
  }
}

const images = {
  bols: require('./bottles/bols.png'),
  coke: require('./bottles/coke.png'),
  cranberry: require('./bottles/cranberry.png'),
  gin: require('./bottles/gin.png'),
  orangejuice: require('./bottles/orange.png'),
  rum: require('./bottles/rum.png'),
  tequila: require('./bottles/tequila.png'),
  tonic: require('./bottles/tonic.png'),
  vodka: require('./bottles/vodka.png'),
  whiskey: require('./bottles/whiskey.png'),
  limejuice: require('./bottles/limejuice.png'),
  carillo: require('./bottles/carillo.png'),
  pineapplejuice: require('./bottles/pineapple.png'),
  applejuice: require('./bottles/apple.png'),
  jaloviina: require('./bottles/jaloviina.png'),
  syrup: require('./bottles/syrup.png')
};

const styles = StyleSheet.create({
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
    textAlign: 'center',
  },
});
