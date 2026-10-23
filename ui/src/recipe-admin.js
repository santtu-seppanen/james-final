import React, {Component} from 'react';
import {View} from 'react-native-web';
import {
  StyleSheet,
  Dimensions,
  Text,
  Image,
  TouchableHighlight,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import InfoModal from './infoModal';
import Carousel from 'react-native-snap-carousel';
import {ADMIN_PIN} from './config';

export default class RecipeAdmin extends Component {
  constructor(props) {
    super(props);
    this.state = {
      drinks: {},
      modalMessage: '',
      modalVisible: false,
      authorised: false,
      code: '',
      ip: 'not available',
    };

    this.getMyIp();
  }

  componentDidMount = () => {
    console.log('Component mounting');
    this.props.navigation.addListener('focus', () => {
      // do something
      this.getRecipesFromJames();
    });
  };

  getMyIp() {
    console.log();
    fetch('http://localhost:8000/getIp')
      .then((response) => response.json())
      .then((body) => {
          this.setState(body);
      });
  }

  getRecipesFromJames() {
    fetch('http://localhost:8000/getRecipes')
      .then((response) => response.json())
      .then((body) => {
        this.setState({drinks: JSON.parse(body)});
        console.log(this.state.drinks);
      });
  }

  _renderItem({item, index}) {
    return (
      <View style={styles.carousel}>
        <TouchableHighlight
          style={{flex: 1}}
          onPress={() => {
            this.props.navigation.push('SingleRecipeConfig', {
              recipe: item,
              drinks: this.state.drinks,
              index,
            });
          }}>
          <View style={{alignItems: 'center'}}>
            <Text style={styles.imageButton}>{item.friendlyname}</Text>
            {images[item.imageUrl] != undefined ? (
              <Image
                source={images[item.imageUrl]}
                style={{width: 200, height: 200}}></Image>
            ) : (
              <Image
                source={require('./drinks/drink.png')}
                style={{width: 100, height: 100}}></Image>
            )}
          </View>
        </TouchableHighlight>
      </View>
    );
  }

  checkCode = (digit) => {
    this.setState({code: this.state.code + digit}, () => {
      if (digit == 'back') {
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

  render() {
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, '#', 'back'];
    return (
      <SafeAreaView
        style={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          backgroundColor: 'white',
        }}>
        {this.state.authorised === true && (
          <View
            style={{
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
            }}>
            <Text
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignSelf: 'flex-end',
              }}>
              {this.state.ip}
            </Text>
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                marginTop: 60,
              }}>
              <Carousel
                layout={'default'}
                ref={(ref) => (this.carousel = ref)}
                data={this.state.drinks}
                sliderWidth={Dimensions.get('window').width - 200}
                itemWidth={300}
                itemHeight={400}
                renderItem={this._renderItem.bind(this)}
                onSnapToItem={(index) => this.setState({activeIndex: index})}
              />
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignSelf: 'center',
              }}>
              <TouchableOpacity
                onPress={() => this.props.navigation.goBack()}
                style={styles.button}>
                <Text style={styles.buttonText}>Back</Text>
              </TouchableOpacity>
            </View>
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
  humppaleka: require('./drinks/humppaleka.png'),
  gin_tonic: require('./drinks/gin_tonic.png'),
  red_drink: require('./drinks/red_drink.png'),
  grey_drink: require('./drinks/grey_drink.png'),
  sea_breeze: require('./drinks/sea_breeze.jpg'),
  cranberry_lime: require('./drinks/cranberry_lime.jpg'),
  rum_coke: require('./drinks/rum_coke.png'),
  vodka: require('./drinks/vodka.png'),
  bluemargarita: require('./drinks/margarita.png'),
  screwdriver: require('./drinks/screwdriver.jpg'),
  mikahakkinen: require('./drinks/mikahakkinen.jpg'),
  ginrickey: require('./drinks/ginrickey.jpg'),
  tequila_sunrise: require('./drinks/tequila_sunrise.png'),
  moukku: require('./drinks/moukku.jpg'),
  whiskey: require('./drinks/whiskey.png'),
};

const styles = StyleSheet.create({
  imageButton: {
    borderRadius: 3,
    padding: 20,
    color: '#1B95E0',
    fontWeight: 'bold',
    fontSize: 16,
  },
  carousel: {
    borderColor: '#333',
    borderRadius: 15,
    borderWidth: 1,
    height: 300,
    width: 250,
    backgroundColor: 'white',
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
